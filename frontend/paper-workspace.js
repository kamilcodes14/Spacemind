import {getDocument,GlobalWorkerOptions} from 'pdfjs-dist';
GlobalWorkerOptions.workerSrc='/assets/pdf.worker.mjs';
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
const state={selected:[],task:'chat'};
const request=(path,body,method=body?'POST':'GET')=>window.SpaceMindBackend.request(path,{method,...(body?{body:JSON.stringify(body)}:{})});
const button=(title,fn)=>{const b=el('button',title,'secondary');b.type='button';b.onclick=async()=>{b.disabled=true;try{await fn();}catch(e){window.SpaceMindUI?.toast(e.message);}finally{b.disabled=false;}};return b;};
function link(url,title){try{const u=new URL(url);if(!['http:','https:'].includes(u.protocol))return el('span',title);const a=el('a',title);a.href=u.href;a.target='_blank';a.rel='noopener noreferrer';return a;}catch{return el('span',title);}}
export async function extractPDF(file){
 if(file.size>20*1024*1024)throw Error('Choose a PDF smaller than 20 MB.');
 const bytes=new Uint8Array(await file.arrayBuffer());if(new TextDecoder().decode(bytes.slice(0,5))!=='%PDF-')throw Error('Choose a valid PDF.');
 const task=getDocument({data:bytes,isEvalSupported:false,enableXfa:false,cMapUrl:'/assets/cmaps/',cMapPacked:true,standardFontDataUrl:'/assets/standard_fonts/',wasmUrl:'/assets/wasm/'});
 try{
 const pdf=await task.promise;if(pdf.numPages>100)throw Error('Upload at most 100 pages at a time.');
 const pages=[];let size=0;
 for(let n=1;n<=pdf.numPages;n++){
  const page=await pdf.getPage(n),content=await page.getTextContent();let lastY=null,line='';
  for(const item of content.items){if(!('str' in item))continue;const y=Math.round(item.transform[5]);if(lastY!==null&&Math.abs(y-lastY)>3)line+='\n';line+=item.str+' ';if(item.hasEOL)line+='\n';lastY=y;}
  const text=line.replace(/\u0000/g,'').slice(0,50000);size+=new TextEncoder().encode(text).length;if(size>500000)throw Error('This PDF has too much extracted text. Split it into smaller papers.');pages.push({page:n,text});page.cleanup();
 }
 if(!pages.some(p=>p.text.trim().length>40))throw Error('No readable text was found. Scanned PDFs need OCR before upload.');
 return {title:file.name.replace(/\.pdf$/i,'').slice(0,500),metadata:{origin:'uploaded_pdf',filename:file.name,page_count:pdf.numPages,extraction:'PDF text; check equation symbols and table alignment against the original'},pages};
 }finally{await task.destroy();}
}
function selectedNotice(){const n=document.getElementById('paperSelection');if(n)n.textContent=state.selected.length?`${state.selected.length} selected paper(s) · ${state.task}. Clear selection to search all sources.`:'';}
async function saveSource(source){
 await request('/papers',{title:(source.title||source.source_file||'Research source').slice(0,500),metadata:source,pages:[{page:source.page||1,text:source.snippet||''}]});window.SpaceMindUI.toast('Saved to your papers.');
}
function graphView(source,groups){
 const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 760 420');svg.setAttribute('role','img');svg.setAttribute('aria-label','Citation network: references point outward, citing papers point inward, related papers have dashed links.');
 const add=(tag,attrs,text)=>{const n=document.createElementNS(ns,tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,String(v));if(text)n.textContent=text;svg.append(n);return n;};
 const center={x:380,y:205};const nodes=[];for(const [group,items]of Object.entries(groups)){const side=group==='References'?0:group==='Cited by'?1:2;items.slice(0,4).forEach((p,i)=>nodes.push({...p,group,x:side===0?135:side===1?625:100+i*185,y:side===2?365:55+i*78}));}
 for(const n of nodes){const incoming=n.group==='Cited by';const x1=incoming?n.x:center.x,y1=incoming?n.y:center.y,x2=incoming?center.x:n.x,y2=incoming?center.y:n.y;
  add('line',{x1,y1,x2,y2,stroke:n.group==='Related papers'?'#8596b3':'#b9a3ee','stroke-dasharray':n.group==='Related papers'?'5 4':'none','stroke-width':1.5});
  if(n.group!=='Related papers'){const angle=Math.atan2(y2-y1,x2-x1),x=x1+(x2-x1)*.66,y=y1+(y2-y1)*.66;add('path',{d:`M ${x-7*Math.cos(angle-.5)} ${y-7*Math.sin(angle-.5)} L ${x} ${y} L ${x-7*Math.cos(angle+.5)} ${y-7*Math.sin(angle+.5)}`,fill:'none',stroke:'#b9a3ee','stroke-width':2});}}
 for(const n of [...nodes,{...center,title:source.title||source.source_file||'Selected paper',group:'Selected paper'}]){add('rect',{x:n.x-83,y:n.y-21,width:166,height:42,rx:8,fill:n.group==='Selected paper'?'#382d54':'#121d2e',stroke:'#627391'});add('text',{x:n.x,y:n.y+4,'text-anchor':'middle',fill:'#e3e8f1','font-size':10},n.title.slice(0,27));}
 add('text',{x:135,y:18,fill:'#b9c6dc','text-anchor':'middle','font-size':12},'References');add('text',{x:625,y:18,fill:'#b9c6dc','text-anchor':'middle','font-size':12},'Cited by');add('text',{x:380,y:410,fill:'#b9c6dc','text-anchor':'middle','font-size':12},'Related papers (similarity, not a citation)');svg.style.width='100%';return svg;
}
async function graph(source){
 const id=source.arxiv_id?'ARXIV:'+source.arxiv_id:source.doi?'DOI:'+source.doi:source.paperId||null;
 if(!id)throw Error('This source has no supported paper identifier. Use Discover to find its record.');
 const d=dialog('Citation graph and related papers');d.body.textContent='Loading references, citations and related papers…';
 try{const result=await request('/discovery',{kind:'graph',paper_id:id});d.body.replaceChildren();
  d.body.append(graphView(source,result.groups));
  d.body.append(el('p','Links show the first 20 results per relationship; this is not a complete citation network.','notice'));
  for(const [group,items] of Object.entries(result.groups)){d.body.append(el('h3',group));renderPapers(d.body,items);}
  if(result.warnings.length)d.body.append(el('p',result.warnings.join(' '),'notice'));
 }catch(e){d.body.textContent=e.message;}
}
function dialog(title){const d=el('dialog',null,'research-dialog'),h=el('div',null,'dialog-heading'),body=el('div',null,'research-body');h.append(el('h2',title),button('Close',()=>d.close()));d.append(h,body);document.body.append(d);d.addEventListener('close',()=>d.remove());d.showModal();return {dialog:d,body};}
function renderPapers(host,items){if(!items.length)host.append(el('p','No records returned.'));for(const p of items){const card=el('article',null,'resource-card');card.append(link(p.url,p.title||'Paper'),el('p',[p.year,(p.authors||[]).join(', ')].filter(Boolean).join(' · ')),el('p',p.snippet||''),button('Save paper',()=>saveSource(p)),button('Citations / related',()=>graph(p)));host.append(card);}}
async function open(){
 if(!window.SpaceMindBackend)throw Error('The paper workspace requires the hosted account service.');
 const d=dialog('Your research library'),nav=el('div',null,'science-actions'),content=el('div');
 d.body.append(nav,content);
 let viewVersion=0;
 async function show(tab){const version=++viewVersion;content.replaceChildren(el('p','Loading…'));
 try{
 if(tab==='papers'){
  const [papers,collections]=await Promise.all([request('/papers'),request('/collections')]);if(version!==viewVersion)return;content.replaceChildren();
  const upload=el('input');upload.type='file';upload.accept='.pdf,application/pdf';upload.setAttribute('aria-label','Upload a paper PDF');
  const status=el('p',null,'notice');upload.onchange=async()=>{if(!upload.files[0])return;upload.disabled=true;status.textContent='Reading and saving your PDF…';try{await request('/papers',await extractPDF(upload.files[0]));await show('papers');}catch(e){status.textContent=e.message;upload.disabled=false;}};
  content.append(upload,el('p','PDF text is saved privately to your account. Up to 20 MB / 100 pages; scanned pages need OCR. Check equations and table layout against the original.','science-note'),status);
  const collection=el('input');collection.placeholder='New collection name';collection.maxLength=100;collection.setAttribute('aria-label','New collection name');
  content.append(collection,button('Create collection',async()=>{if(!collection.value.trim())return;await request('/collections',{name:collection.value.trim()});await show('papers');}));
  const filter=el('select');filter.setAttribute('aria-label','Filter by collection');const all=el('option','All papers');all.value='';filter.append(all);for(const c of collections){const o=el('option',c.name);o.value=c.id;filter.append(o);}content.append(filter);
  const tasks=el('select');tasks.setAttribute('aria-label','Paper research task');for(const [value,name]of Object.entries({chat:'Chat with selection',summary:'Summarize',compare:'Compare papers',literature:'Literature review',problems:'Open problems',equations:'Extract equations',tables:'Extract tables'})){const o=el('option',name);o.value=value;tasks.append(o);}tasks.value=state.task;
  content.append(tasks,button('Use selected papers',()=>{if(!state.selected.length)throw Error('Select at least one paper.');if(tasks.value==='compare'&&state.selected.length<2)throw Error('Select two papers to compare.');state.task=tasks.value;selectedNotice();d.dialog.close();window.SpaceMindUI.prepare(`Please ${tasks.options[tasks.selectedIndex].text.toLowerCase()} using my selected papers.`);}),button('Clear selection',()=>{state.selected=[];state.task='chat';selectedNotice();show('papers');}));
  const list=el('div');content.append(list);
  function draw(){list.replaceChildren();for(const p of papers.filter(p=>!filter.value||p.collection_id===filter.value)){
   const card=el('article',null,'resource-card'),label=el('label'),check=el('input');check.type='checkbox';check.checked=state.selected.includes(p.id);check.onchange=()=>{if(check.checked&&state.selected.length>=6){check.checked=false;return window.SpaceMindUI.toast('Select up to six papers.');}state.selected=check.checked?[...state.selected,p.id]:state.selected.filter(x=>x!==p.id);selectedNotice();};label.append(check,document.createTextNode(p.title));
   const move=el('select');move.setAttribute('aria-label','Collection for '+p.title);const none=el('option','Unfiled');none.value='';move.append(none);collections.forEach(c=>{const o=el('option',c.name);o.value=c.id;move.append(o);});move.value=p.collection_id||'';
   const notes=el('textarea');notes.value=p.notes;notes.maxLength=20000;notes.placeholder='Notes for this paper';notes.setAttribute('aria-label','Notes for '+p.title);
   card.append(label,move,notes,button('Save notes / collection',async()=>{await request('/papers/'+p.id,{notes:notes.value,collection_id:move.value},'PATCH');window.SpaceMindUI.toast('Saved.');}),button('Citations / related',()=>graph(p.metadata)),button('Delete paper',async()=>{if(!confirm('Delete this saved paper and its notes?'))return;await request('/papers/'+p.id,undefined,'DELETE');state.selected=state.selected.filter(x=>x!==p.id);selectedNotice();await show('papers');}));list.append(card);
  }if(!papers.length)list.append(el('p','Upload a PDF or save a source from a research answer.'));}filter.onchange=draw;draw();
 }else if(tab==='discover'){
  content.replaceChildren();const form=el('form'),q=el('input'),provider=el('select'),results=el('div');q.placeholder='Search astronomy papers';q.required=true;q.maxLength=100;q.setAttribute('aria-label','Paper search');for(const [v,t]of [['scholar','Semantic Scholar'],['ads','NASA ADS']]){const o=el('option',t);o.value=v;provider.append(o);}provider.setAttribute('aria-label','Paper archive');const submit=el('button','Search','primary');form.append(q,provider,submit);content.append(form,results);form.onsubmit=async e=>{e.preventDefault();submit.disabled=true;results.textContent='Searching…';try{const data=await request('/discovery',{kind:provider.value,query:q.value});results.replaceChildren();for(const warning of data.warnings||[])results.append(el('p',warning,'notice'));renderPapers(results,data.papers);}catch(e){results.textContent=e.message;}finally{submit.disabled=false;}};
 }else{
  const [topics,alerts]=await Promise.all([request('/topics'),request('/alerts')]);if(version!==viewVersion)return;content.replaceChildren();content.append(el('p','Follow a topic for daily in-app alerts from newly imported arXiv abstracts. New subscriptions start with future imports.','notice'));const input=el('input');input.placeholder='e.g. exoplanet atmosphere';input.maxLength=100;input.setAttribute('aria-label','Topic to follow');content.append(input,button('Follow topic',async()=>{if(input.value.trim().length<2)return;await request('/topics',{topic:input.value.trim()});await show('digest');}));for(const t of topics)content.append(button('Unfollow '+t.topic,async()=>{await request('/topics/'+t.id,undefined,'DELETE');await show('digest');}));for(const a of alerts){const row=el('article',null,'resource-card');row.append(link(a.url,a.title),el('p',a.created_at),button(a.seen?'Read':'Mark read',async()=>{await request('/alerts/'+a.id,{seen:true},'PATCH');await show('digest');}));content.append(row);}if(!alerts.length)content.append(el('p','No new-paper alerts yet.'));
 }
 }catch(e){if(version===viewVersion)content.textContent=e.message;}}
 for(const [key,label]of [['papers','My papers'],['discover','Discover'],['digest','Daily digest']])nav.append(button(label,()=>show(key)));await show('papers');
}
window.SpaceMindPapers={open,saveSource,graph,selection:()=>({paper_ids:[...state.selected],paper_task:state.task}),reset:()=>{state.selected=[];state.task='chat';selectedNotice();}};
