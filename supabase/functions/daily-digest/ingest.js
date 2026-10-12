const clean=s=>s.replace(/<[^>]*>/g,' ').replace(/&(?:amp|lt|gt|quot|apos);|&#(?:x[0-9a-f]+|[0-9]+);/gi,m=>{
 const values={'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'"};if(values[m])return values[m];const n=m.startsWith('&#x')?parseInt(m.slice(3,-1),16):parseInt(m.slice(2,-1),10);return n>0&&n<=0x10ffff?String.fromCodePoint(n):'';
}).replace(/\s+/g,' ').trim();
// arXiv Atom only: bounded input; no general XML entity expansion or remote DTD.
export function parseArxiv(xml){
 if(xml.length>2_000_000||!/<feed\b/.test(xml))throw Error('Invalid archive feed');
 const tag=(s,name)=>clean(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`).exec(s)?.[1]||'');
 return [...xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/g)].map(([,s])=>{
  const id=tag(s,'id').split('/abs/')[1];if(!id||!/^[a-z0-9.\/-]+$/i.test(id))return null;
  return {id,doc_id:'arxiv:'+id,title:tag(s,'title').slice(0,500),content:tag(s,'summary').slice(0,6000),authors:[...s.matchAll(/<author>([\s\S]*?)<\/author>/g)].map(([,a])=>tag(a,'name')).slice(0,100),year:Number(tag(s,'published').slice(0,4)),categories:[...s.matchAll(/<category\s[^>]*term="([^"]+)"/g)].map(([,c])=>c),origin:'arxiv_abstract',url:'https://arxiv.org/abs/'+id,arxiv_id:id};
 }).filter(p=>p?.title&&p.content);
}
export async function digestRows(fetcher=fetch){
 const query='cat:astro-ph.SR OR cat:astro-ph.CO OR cat:astro-ph.EP OR cat:astro-ph.HE';
 const response=await fetcher('https://export.arxiv.org/api/query?'+new URLSearchParams({search_query:query,start:'0',max_results:'100',sortBy:'submittedDate',sortOrder:'descending'}),{signal:AbortSignal.timeout(45000),headers:{'User-Agent':'SpaceMind/0.5 research digest'}});
 if(!response.ok)throw Error('Archive unavailable');
 const reader=response.body.getReader();let size=0,xml='';const decoder=new TextDecoder();
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2_000_000)throw Error('Archive feed too large');xml+=decoder.decode(value,{stream:true});}xml+=decoder.decode();}finally{await reader.cancel().catch(()=>{});}
 const rows=parseArxiv(xml);if(!rows.length)throw Error('Archive returned no papers');
 return rows.map(p=>({...p,id:'digest:'+p.id,embedding:null}));
}
