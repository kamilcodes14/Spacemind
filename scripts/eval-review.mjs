import {createHash} from 'node:crypto';
export const RUBRIC_VERSION='research-review-v2';
export const dimensions=['factual_correctness','numerical_accuracy_units','citation_support','uncertainty','false_premise','refusal_correctness'];
export const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function sentences(answer){
 // Review includes uncited sentences; segmentation is a convenience, not a claim classifier.
 return (String(answer).match(/[^\n]+/g)||[]).flatMap(line=>line.split(/(?<=[.!?])\s+(?!\[\d+\])/)).filter(s=>s.trim()).map((text,id)=>({id,text:text.trim(),citations:[...new Set([...text.matchAll(/\[(\d+)\]/g)].map(m=>+m[1]))]}));
}
export function reviewTemplate(result,item){
 return {id:item.id,response_sha256:digest({answer:result.answer,citations:result.citations}),reference_answer:item.gold_answer,rubric:item.rubric,reviewer:null,reviewed_at:null,scores:Object.fromEntries(dimensions.map(d=>[d,null])),rationale:Object.fromEntries(dimensions.map(d=>[d,''])),sentences:sentences(result.answer).map(s=>({...s,factual:null,status:'unreviewed',evidence:[],rationale:''})),notes:''};
}
export function validateReview(review,result,item){
 const errors=[];
 if(!review||review.id!==item.id)return ['Missing review'];
 if(review.response_sha256!==digest({answer:result.answer,citations:result.citations}))errors.push('Review does not match captured response');
 if(!review.reviewer?.trim()||!Number.isFinite(Date.parse(review.reviewed_at)))errors.push('Reviewer and date required');
 for(const d of dimensions){
  const score=review.scores?.[d];
  if(![0,1,2,'na'].includes(score)||!review.rationale?.[d]?.trim())errors.push('Unreviewed dimension: '+d);
  if(score==='na'&&(['factual_correctness','uncertainty','refusal_correctness'].includes(d)||(d==='numerical_accuracy_units'&&item.numeric)||(d==='false_premise'&&item.category==='false_premise')))errors.push('Required dimension cannot be N/A: '+d);
 }
 const expected=sentences(result.answer),rows=review.sentences||[];
 if(rows.length!==expected.length||new Set(rows.map(s=>s.id)).size!==expected.length)errors.push('Every sentence must be reviewed exactly once');
 for(const s of expected){
  const row=rows.find(r=>r.id===s.id);
  if(!row||row.text!==s.text||typeof row.factual!=='boolean'||!row.rationale?.trim()) {errors.push('Unreviewed sentence '+s.id);continue;}
  if(!['supported','partial','unsupported','not_applicable'].includes(row.status))errors.push('Invalid support status '+s.id);
  if(row.factual&&row.status==='not_applicable')errors.push('Factual claim needs support decision '+s.id);
  if(['supported','partial'].includes(row.status)){
   if(!row.evidence?.length)errors.push('Missing passage '+s.id);
   for(const e of row.evidence||[]){
    const source=result.citations?.[e.citation-1];
    const norm=t=>String(t||'').replace(/\s+/g,' ').trim();
    if(!s.citations.includes(e.citation)||!source||norm(e.quote).length<8||!norm(source.snippet).includes(norm(e.quote)))errors.push('Passage is not in cited captured source '+s.id);
    if(!e.locator?.trim())errors.push('Source/page/section locator required '+s.id);
   }
  }
 }
 if(review.scores?.citation_support===2&&rows.some(s=>s.factual&&s.status!=='supported'))errors.push('Full citation score contradicts sentence decisions');
 return errors;
}
export function summarize(report){
 const ok=report.results.filter(r=>!r.error);
 const times=ok.map(r=>r.latency_ms).filter(Number.isFinite).sort((a,b)=>a-b);
 const percentile=p=>times.length?times[Math.max(0,Math.ceil(p*times.length)-1)]:null;
 const reviewed=ok.filter(r=>r.review_valid===true);
 const scores=Object.fromEntries(dimensions.map(d=>{const values=reviewed.map(r=>r.review.scores[d]).filter(Number.isFinite);return [d,{reviewed:values.length,mean:values.length?values.reduce((a,b)=>a+b,0)/values.length:null}];}));
 const claims=reviewed.flatMap(r=>r.review.sentences).filter(s=>s.factual);
 const cited=claims.filter(s=>s.citations?.length);
 return {attempted:report.results.length,successful_requests:ok.length,errors:report.results.length-ok.length,reviewed:reviewed.length,p50_ms:percentile(.5),p95_ms:percentile(.95),latency_definition:'Nearest-rank, successful HTTP request through parsed response; excludes persistence readback and quota waiting.',scores,citation_precision:cited.length?cited.filter(s=>s.status==='supported').length/cited.length:null,citation_coverage:claims.length?claims.filter(s=>s.status==='supported').length/claims.length:null,quality_pass:report.results.length===50&&reviewed.length===50&&reviewed.every(r=>dimensions.every(d=>[2,'na'].includes(r.review.scores[d])))};
}
export function representativeSample(cases){
 // Fixed before observing outcomes: deterministic two per stratum, plus all challenge cases.
 const selected=[];
 for(const category of [...new Set(cases.map(c=>c.category))]){
  const group=cases.filter(c=>c.category===category);
  selected.push(...(['false_premise','future_date'].includes(category)?group:group.filter((_,i)=>i===0||i===Math.floor(group.length/2))).map(c=>c.id));
 }
 return selected;
}
