import {fetchJSON,HttpError,safeURL} from '../_shared/http.js';
const fields='paperId,title,abstract,url,year,authors,externalIds';
const normalize=p=>({paperId:p.paperId,title:p.title||'Untitled paper',source_file:p.title,authors:(p.authors||[]).map(a=>a.name),year:p.year,url:safeURL(p.url),arxiv_id:p.externalIds?.ArXiv||null,doi:p.externalIds?.DOI||null,origin:'semantic_scholar_abstract',snippet:(p.abstract||'').slice(0,12000)});
export async function discoverWithFallback(input,env,client,fetcher=fetch){
 try{return await discover(input,env,fetcher);}catch(error){
  if(!['scholar','ads'].includes(input.kind)||![429,503].includes(error.status))throw error;
  const query=input.query.replace(/\bblackholes\b/gi,'black holes').replace(/\bblackhole\b/gi,'black hole');
  const result=await client.rpc('match_papers_hybrid',{query_embedding:null,query_text:query,match_count:30});
  if(result.error)throw error;
  const seen=new Set(),papers=[];
  for(const p of result.data||[]){if(seen.has(p.doc_id))continue;seen.add(p.doc_id);papers.push({title:p.title,source_file:p.title,authors:p.authors||[],year:p.year,url:safeURL(p.url),arxiv_id:p.arxiv_id,doc_id:p.doc_id,origin:p.origin,snippet:p.content||''});}
  const archive=input.kind==='ads'?'NASA ADS':'Semantic Scholar';
  return {papers:papers.slice(0,20),source:'imported_corpus',requested_source:input.kind,warnings:[`${archive} is unavailable. Showing matches from the imported SpaceMind library; these are not live archive search results.`,...(query!==input.query?[`Searched the imported library for “${query}”.`]:[])]};
 }
}
export async function discover(input,env,fetcher=fetch){
 const headers=env.SEMANTIC_SCHOLAR_API_KEY?{'x-api-key':env.SEMANTIC_SCHOLAR_API_KEY}:{};
 if(input.kind==='graph'){
  const id=input.paper_id;if(typeof id!=='string'||!/^(?:[a-f0-9]{40}|ARXIV:[a-z0-9.\/-]+|DOI:10\.[^\s]{1,180})$/i.test(id))throw new HttpError(422,'Choose a paper with an arXiv, DOI or Semantic Scholar identifier.');
  const base='https://api.semanticscholar.org/graph/v1/paper/'+encodeURIComponent(id);
  const urls=[base+'/references?limit=20&fields='+fields,base+'/citations?limit=20&fields='+fields,'https://api.semanticscholar.org/recommendations/v1/papers/forpaper/'+encodeURIComponent(id)+'?limit=20&fields='+fields];
  const result=await Promise.allSettled(urls.map(url=>fetchJSON(url,{headers},fetcher)));
  const groups={},warnings=[];result.forEach((r,i)=>{const label=['References','Cited by','Related papers'][i];if(r.status==='rejected'){groups[label]=[];warnings.push(label+' could not be loaded.');return;}const rows=i===2?r.value.recommendedPapers:r.value.data;groups[label]=(rows||[]).map(p=>normalize(p.citedPaper||p.citingPaper||p));});
  return {groups,warnings};
 }
 if(typeof input.query!=='string'||input.query.trim().length<2||input.query.length>100)throw new HttpError(422,'Enter a search query of 2–100 characters.');
 if(input.kind==='scholar'){
  const url='https://api.semanticscholar.org/graph/v1/paper/search?'+new URLSearchParams({query:input.query,limit:'20',fields});
  const data=await fetchJSON(url,{headers},fetcher);return {papers:(data.data||[]).map(normalize)};
 }
 if(input.kind==='ads'){
  if(!env.ADS_API_TOKEN)throw new HttpError(503,'This archive connection is currently unavailable. Other discovery sources are still available.');
  const url='https://api.adsabs.harvard.edu/v1/search/query?'+new URLSearchParams({q:input.query,rows:'20',fl:'bibcode,title,author,year,abstract,doi'});
  const data=await fetchJSON(url,{headers:{Authorization:'Bearer '+env.ADS_API_TOKEN}},fetcher);
  return {papers:(data.response?.docs||[]).map(p=>({title:p.title?.[0],source_file:p.title?.[0],authors:p.author||[],year:Number(p.year),doi:p.doi?.[0],origin:'ads_abstract',url:'https://ui.adsabs.harvard.edu/abs/'+encodeURIComponent(p.bibcode),snippet:(p.abstract||'').slice(0,12000)}))};
 }
 throw new HttpError(422,'Choose a supported discovery source.');
}
