import { readFile } from 'node:fs/promises';

export function validate(data) {
  if (data?.schema_version !== '1.0' || !['example','research'].includes(data.kind) || !Array.isArray(data.items) || !Array.isArray(data.documents)) throw Error('Invalid benchmark envelope');
  const ids = new Set();
  for (const d of data.documents) {
    if (!d.id || ids.has(d.id) || typeof d.text !== 'string') throw Error('Invalid/duplicate document');
    ids.add(d.id);
  }
  const questions = new Set();
  for (const q of data.items) {
    if (!q.id || questions.has(q.id) || typeof q.query !== 'string' || !q.query.trim() || !['unreviewed','reviewed'].includes(q.review_status)) throw Error('Invalid/duplicate question');
    questions.add(q.id);
    if (q.title_derived && q.review_status !== 'unreviewed') throw Error('Title-derived examples must remain unreviewed');
    if (q.gold_document_ids != null && (!Array.isArray(q.gold_document_ids) || !q.gold_document_ids.length || new Set(q.gold_document_ids).size !== q.gold_document_ids.length || q.gold_document_ids.some(id=>!ids.has(id)) || q.review_status !== 'reviewed' || !q.reviewer || data.kind === 'example')) throw Error('Gold requires reviewed, attributable research labels');
  }
  return data;
}
export async function load(path) { return validate(JSON.parse(await readFile(path,'utf8'))); }
const terms = text => text.toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
export function bm25(documents, query) {
  const tokens = documents.map(d=>terms(d.text)), average = tokens.reduce((s,t)=>s+t.length,0)/tokens.length || 1;
  const words = [...new Set(terms(query))];
  return documents.map((d,i)=>({id:d.id,score:words.reduce((score,w)=>{
    const df=tokens.filter(t=>t.includes(w)).length, tf=tokens[i].filter(t=>t===w).length;
    return score + Math.log(1+(documents.length-df+.5)/(df+.5))*tf*2.2/(tf+1.2*(.25+.75*tokens[i].length/average));
  },0)})).sort((a,b)=>b.score-a.score || a.id.localeCompare(b.id)).map(d=>d.id);
}
const vector = v => Array.isArray(v) && v.length>0 && v.every(Number.isFinite) && v.some(x=>x!==0);
export function dense(documents, embedding) {
  if (!vector(embedding) || documents.some(d=>!vector(d.embedding)||d.embedding.length!==embedding.length)) throw Error('Embeddings unavailable or incompatible');
  const norm=v=>Math.hypot(...v);
  return documents.map(d=>({id:d.id,score:d.embedding.reduce((s,v,i)=>s+v*embedding[i],0)/(norm(d.embedding)*norm(embedding))})).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id)).map(d=>d.id);
}
export function rrf(rankings) {
  const scores=new Map();
  for(const ranking of rankings) for(const [i,id] of [...new Set(ranking)].entries()) scores.set(id,(scores.get(id)||0)+1/(60+i+1));
  return [...scores].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).map(([id])=>id);
}
export function score(ranking,gold,k) {
  if (!Array.isArray(gold)||!gold.length || !Number.isInteger(k)||k<1) throw Error('Gold and positive k required');
  const unique=[...new Set(ranking)], relevant=new Set(gold), first=unique.findIndex(id=>relevant.has(id));
  return {recall_at_k:unique.slice(0,k).filter(id=>relevant.has(id)).length/relevant.size,mrr:first<0?0:1/(first+1)};
}
export function bootstrap(values,seed=1729,iterations=2000) {
  if(!values.length) throw Error('No observations');
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
  const means=Array.from({length:iterations},()=>values.reduce(s=>s+values[Math.floor(random()*values.length)],0)/values.length).sort((a,b)=>a-b);
  return {mean:values.reduce((a,b)=>a+b,0)/values.length,ci95:[means[Math.floor(iterations*.025)],means[Math.min(iterations-1,Math.floor(iterations*.975))]]};
}
/** Retrievers accept {documents, item, candidates?} and return ranked document IDs. */
export async function run(data,{k=5,retrievers={},rerank}={}) {
  validate(data);
  if(!Number.isInteger(k)||k<1)throw Error('k must be a positive integer');
  const report={schema_version:'1.0',kind:data.kind,k,uncertainty:'Question-level percentile bootstrap; 2000 resamples, seed 1729; not corpus-wide uncertainty.',arms:{}};
  for(const arm of ['bm25','dense','hybrid_rrf','hybrid_rerank']) {
    const results=[],skipped=[];
    for(const item of data.items) {
      try {
        if(arm!=='bm25' && (!vector(item.embedding)||!data.documents.length||data.documents.some(d=>!vector(d.embedding)||d.embedding.length!==item.embedding.length))) {skipped.push({id:item.id,reason:'Compatible query/document embeddings unavailable'});continue;}
        if(arm==='hybrid_rerank'&&!rerank&&!retrievers[arm]){skipped.push({id:item.id,reason:'No reranker supplied'});continue;}
        let ranking;
        if(retrievers[arm])ranking=await retrievers[arm]({documents:data.documents,item});
        else if(arm==='bm25')ranking=bm25(data.documents,item.query);
        else if(arm==='dense')ranking=dense(data.documents,item.embedding);
        else {ranking=rrf([bm25(data.documents,item.query),dense(data.documents,item.embedding)]);if(arm==='hybrid_rerank')ranking=await rerank({documents:data.documents,item,candidates:ranking});}
        if(!Array.isArray(ranking)||new Set(ranking).size!==ranking.length||ranking.some(id=>!data.documents.some(d=>d.id===id)))throw Error('Retriever returned invalid IDs');
        results.push({id:item.id,ranking,...(data.kind==='research'&&item.gold_document_ids?{metrics:score(ranking,item.gold_document_ids,k)}:{})});
      }catch(error){skipped.push({id:item.id,reason:String(error.message)});}
    }
    const labelled=results.filter(r=>r.metrics);
    report.arms[arm]={status:results.length?'ran':'skipped',results,skipped,labelled_count:labelled.length,metrics:labelled.length?{recall_at_k:bootstrap(labelled.map(r=>r.metrics.recall_at_k)),mrr:bootstrap(labelled.map(r=>r.metrics.mrr))}:null,measurement:labelled.length?'Reviewed labelled subset only':'not measured'};
  }
  return report;
}
