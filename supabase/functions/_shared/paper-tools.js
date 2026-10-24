import {HttpError} from './http.js';
export const PAPER_TASKS={chat:'Answer the question using the selected papers.',summary:'Summarize research question, methods, findings and limitations, with page citations.',compare:'Compare the selected papers: question, methods, data, findings, disagreements and limitations. Distinguish evidence from interpretation.',literature:'Write a structured literature review of only these selected sources. Explain coverage limits and disagreements; do not imply an exhaustive search.',problems:'List open problems explicitly identified by these papers. Separate authors’ stated limitations from your suggested future work.',equations:'Extract equations present in the retrieved text, preserve notation and state variables and units only where given. If PDF text extraction corrupted an equation, quote it as uncertain rather than reconstructing it.',tables:'Extract tables present in the retrieved text as Markdown. Preserve values, units and page numbers. Mark missing cells and ambiguous columns; never fill gaps.'};
export function selectedEvidence(papers,question){
 const terms=[...new Set(question.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu)||[])];
 return papers.flatMap(p=>{
  const pages=(Array.isArray(p.pages)?p.pages:[]).filter(x=>x&&typeof x.text==='string'&&x.text.trim());
  if(!pages.length&&p.metadata?.snippet)pages.push({page:1,text:p.metadata.snippet});
  return pages.map((page,i)=>({...page,rank:terms.reduce((sum,t)=>sum+(page.text.toLowerCase().includes(t)?1:0),0)+(i===0?.1:0)})).sort((a,b)=>b.rank-a.rank).slice(0,3).map(page=>({
   ...p.metadata,title:p.title,source_file:p.metadata?.origin==='uploaded_pdf'?`${p.title} · p. ${page.page}`:p.title,origin:p.metadata?.origin||'uploaded_pdf',doc_id:p.id,url:p.metadata?.url||null,snippet:page.text.slice(0,4000),page:p.metadata?.origin==='uploaded_pdf'?page.page:null,total_pages:p.metadata?.page_count||pages.length,excerpt_truncated:page.text.length>4000,extraction_warnings:p.metadata?.extraction_warnings||[]
  }));
 });
}
export function validatePaperRequest(body){
 const ids=body.paper_ids??[];
 if(!Array.isArray(ids)||ids.length>6||ids.some(id=>typeof id!=='string'||!/^[0-9a-f-]{36}$/i.test(id))||new Set(ids).size!==ids.length)throw new HttpError(422,'Choose up to six distinct saved papers.');
 const task=body.paper_task||'chat';if(!PAPER_TASKS[task])throw new HttpError(422,'Choose a valid paper task.');
 if(task==='compare'&&ids.length<2)throw new HttpError(422,'Select at least two papers to compare.');
 if(task!=='chat'&&!ids.length)throw new HttpError(422,'Select papers for this task.');
 let execution=null;
 if(body.execution){const e=body.execution;if(typeof e.code!=='string'||typeof e.output!=='string'||e.code.length>16000||e.output.length>12000||!e.output.trim())throw new HttpError(422,'Run a calculation before asking for an explanation.');execution={code:e.code,output:e.output};}
 return {paperIds:ids,paperTask:task,execution};
}
