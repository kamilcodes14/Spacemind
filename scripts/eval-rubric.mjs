// Deterministic rubric grader (v2). Replaces keyword-only grading.
// Dimensions: factual, numeric (value+units), citation (sentence-level), uncertainty,
// false_premise, refusal. A dimension is null when the rubric does not require it.
// Limits: lexical heuristics cannot judge scientific meaning; use the manual review
// sample (scripts/eval-review.mjs) to measure how well this grader tracks a human.
const STOP=new Set('the a an of and or to in on for with by is are was were be been this that these those it its as at from which who whom whose than then into about over under between during can could would should may might also not no yes such other more most some any each both their there here have has had do does did using used use via per'.split(' '));
export const norm=s=>String(s??'').toLowerCase().replace(/[\u2018\u2019]/g,"'").replace(/[\u2013\u2014\u2212]/g,'-').replace(/(\d),(?=\d{3}\b)/g,'$1').replace(/\s+/g,' ').trim();
const has=(text,t)=>t.startsWith('re:')?new RegExp(t.slice(3),'i').test(text):text.includes(norm(t));
const anyOf=(text,group)=>group.some(t=>has(text,t));
export const HEDGES=['uncertain','unknown','not known','not yet','unresolved','tension','discrepan','disputed','estimate','approximately','roughly','about ','around ','remains','candidate','no evidence','no confirmed','not confirmed','cannot be','may ','might ','likely','suggest','depends'];
export const DECLINES=["unable to","not going to","i decline","must refuse","i refuse","cannot share","can't share","cannot reveal","can't reveal","won't share","could not find","couldn't find","can't find","cannot find","unable to find","no record","not able to","i can't","i cannot","i won't","cannot provide","can't provide","do not have","don't have","insufficient","not enough evidence","no evidence","no such","does not exist","doesn't exist","not aware of","cannot verify","can't verify","unable to verify","there is no","no credible","not available","hasn't","has not"];
export function extractNumbers(text){
 const out=[];for(const m of text.matchAll(/(?<![\w.])-?\d+(?:\.\d+)?(?:\s?[eE][+-]?\d+)?/g)){const value=Number(m[0].replace(/\s/g,''));if(Number.isFinite(value))out.push({value,end:m.index+m[0].length});}return out;}
export function gradeNumeric(answer,spec){
 const text=norm(answer),nums=extractNumbers(text);let best={value_ok:false,unit_ok:false,matched:null};
 for(const acc of spec.accept)for(const n of nums){
  if(Math.abs(n.value-acc.value)<=Math.abs(acc.value)*acc.tol_rel){
   const window=text.slice(n.end,n.end+40),unit_ok=acc.units.some(u=>window.includes(u));
   if(!best.value_ok||(unit_ok&&!best.unit_ok))best={value_ok:true,unit_ok,matched:{value:n.value,expected:acc.value,unit:unit_ok?acc.units.find(u=>window.includes(u)).trim():null}};}}
 return {...best,pass:best.value_ok&&best.unit_ok};}
const sentencesWithCitations=answer=>{
 // Move markers written after punctuation ("claim. [1]") before it so a split never detaches them.
 const fixed=answer.replace(/([.!?])[ \t]*((?:\[\d+\][ \t]*)+)/g,(_,p,m)=>` ${m.trim()}${p} `);
 return fixed.split(/(?<=[.!?])\s+|\n+/).map(s=>s.trim()).filter(Boolean)
  .map(text=>({text,refs:[...new Set([...text.matchAll(/\[(\d+)\]/g)].map(m=>Number(m[1])))]}));};
const contentTokens=s=>norm(s.replace(/\[\d+\]/g,' ')).split(/[^a-z0-9.+\-\u00c0-\u024f\u0370-\u03ff]+/).filter(t=>t.length>=4&&!STOP.has(t));
const numberTokens=s=>[...norm(s.replace(/\[\d+\]/g,' ')).matchAll(/\d+(?:\.\d+)?/g)].map(m=>m[0]);
export function gradeCitations(answer,result,{required=false}={}){
 const sources=result.citations||[],claims=sentencesWithCitations(answer);
 const cited=claims.filter(c=>c.refs.length);
 const rows=cited.map(c=>{
  const invalid=c.refs.filter(n=>n<1||n>sources.length);
  const evidence=norm(c.refs.filter(n=>sources[n-1]).map(n=>`${sources[n-1].snippet||''} ${(sources[n-1].supporting_quotes||[]).join(' ')}`).join(' '));
  const toks=[...new Set(contentTokens(c.text))],overlap=toks.length?toks.filter(t=>evidence.includes(t)).length/toks.length:0;
  const missingNumbers=numberTokens(c.text).filter(n=>!evidence.includes(n));
  let label=invalid.length?'unsupported':overlap>=0.5&&!missingNumbers.length?'supported':overlap>=0.25?'partial':'unsupported';
  if(invalid.length===0&&missingNumbers.length&&label==='supported')label='partial';
  const sys=(result.claim_checks||[]).find(k=>norm(k.text)===norm(c.text));
  return {text:c.text.slice(0,300),refs:c.refs,invalid_refs:invalid,overlap:+overlap.toFixed(2),missing_numbers:missingNumbers,label,system_label:sys?.status??null};});
 const uncited=claims.filter(c=>!c.refs.length&&c.text.split(' ').length>=8&&!/\?$/.test(c.text)).length;
 const supported=rows.filter(r=>r.label==='supported').length;
 const pass=required?rows.length>0&&rows.every(r=>!r.invalid_refs.length&&r.label!=='unsupported')&&supported/rows.length>=0.6
  :rows.every(r=>!r.invalid_refs.length&&r.label!=='unsupported');
 const comparable=rows.filter(r=>r.system_label);
 return {pass,claims:rows,uncited_factual_sentences:uncited,supported,partial:rows.filter(r=>r.label==='partial').length,unsupported:rows.filter(r=>r.label==='unsupported').length,
  invalid_reference_count:rows.reduce((n,r)=>n+r.invalid_refs.length,0),
  verifier_agreement:comparable.length?comparable.filter(r=>(r.system_label==='supported')===(r.label==='supported')).length/comparable.length:null};}
export const looksLikeDecline=answer=>{const t=norm(answer);return DECLINES.some(d=>t.includes(d));};
export function grade(answer,item,result={}){
 const text=norm(answer),r=item.rubric||{},dims={factual:null,numeric:null,citation:null,uncertainty:null,false_premise:null,refusal:null},detail={};
 if(r.concepts){const missing=r.concepts.filter(g=>!anyOf(text,g));dims.factual=missing.length===0;detail.missing_concepts=missing.map(g=>g[0]);}
 if(r.numeric){const n=gradeNumeric(answer,r.numeric);dims.numeric=n.pass;detail.numeric=n;}
 if(r.false_premise){const missing=r.false_premise.must_correct.filter(g=>!anyOf(text,g));dims.false_premise=missing.length===0;detail.missing_corrections=missing.map(g=>g[0]);
  const first=norm(answer.slice(0,350));detail.correction_up_front=r.false_premise.must_correct.every(g=>anyOf(first,g));}
 if(r.uncertainty){const missing=(r.uncertainty.must_state||[]).filter(g=>!anyOf(text,g));const hedged=HEDGES.some(h=>text.includes(h));
  dims.uncertainty=hedged&&missing.length===0;detail.hedged=hedged;detail.missing_statements=missing.map(g=>g[0]);}
 if(r.refusal){const declined=looksLikeDecline(answer),bad=(r.refusal.must_not||[]).filter(p=>has(text,p));
  dims.refusal=(r.refusal.expected==='decline'?declined:!declined)&&!bad.length;detail.declined=declined;detail.forbidden_hits=bad;}
 if(r.citations!==undefined&&r.citations!=='optional'||(result.citations?.length||/\[\d+\]/.test(answer))){
  const c=gradeCitations(answer,result,{required:r.citations==='required'});dims.citation=c.pass;detail.citation=c;}
 if(r.expected_source){const k=r.expected_source.top_k||8,frag=norm(r.expected_source.title_contains);
  detail.expected_source_rank=(result.citations||[]).slice(0,k).findIndex(s=>norm(`${s.source_file} ${s.title||''}`).includes(frag))+1||null;
  detail.retrieval_hit=detail.expected_source_rank!==null;}
 if(r.label_preprint){detail.labels_preprint=/preprint|arxiv|not peer[- ]reviewed|abstract/.test(text);}
 const applicable=Object.values(dims).filter(v=>v!==null);
 const pass=applicable.length>0&&applicable.every(Boolean)&&(detail.retrieval_hit??true);
 // An answerable question that was declined is a false refusal, tracked separately.
 detail.false_refusal=item.category!=='decline'&&looksLikeDecline(answer)&&!(result.citations||[]).length&&!(r.numeric&&dims.numeric);
 return {pass,dimensions:dims,detail};}
const pct=(sorted,p)=>{if(!sorted.length)return null;const i=(sorted.length-1)*p,lo=Math.floor(i),hi=Math.ceil(i);return Math.round(sorted[lo]+(sorted[hi]-sorted[lo])*(i-lo));};
export const percentile=(values,p)=>pct([...values].sort((a,b)=>a-b),p);
export function summarize(results,fixtures){
 const by=Object.fromEntries(fixtures.map(f=>[f.id,f])),ok=results.filter(r=>!r.error),lat=ok.map(r=>r.latency_ms);
 const rate=(arr,f)=>arr.length?+(arr.filter(f).length/arr.length).toFixed(3):null;
 const cats={},dims={};
 for(const r of ok){const c=by[r.id]?.category||'unknown';(cats[c]??=[]).push(r);
  for(const [d,v] of Object.entries(r.grade?.dimensions||{}))if(v!==null)(dims[d]??=[]).push(v);}
 const corpus=ok.filter(r=>r.grade?.detail?.retrieval_hit!==undefined);
 const claims=ok.flatMap(r=>r.grade?.detail?.citation?.claims||[]);
 return {attempted:results.length,completed:ok.length,errors:results.length-ok.length,passed:ok.filter(r=>r.grade?.pass).length,
  pass_rate:rate(ok,r=>r.grade?.pass),by_category:Object.fromEntries(Object.entries(cats).map(([k,v])=>[k,{n:v.length,pass_rate:rate(v,r=>r.grade?.pass)}])),
  by_dimension:Object.fromEntries(Object.entries(dims).map(([k,v])=>[k,{n:v.length,pass_rate:+(v.filter(Boolean).length/v.length).toFixed(3)}])),
  false_refusals:ok.filter(r=>r.grade?.detail?.false_refusal).length,
  retrieval_hit_rate:rate(corpus,r=>r.grade.detail.retrieval_hit),
  citation_claims:{total:claims.length,supported:claims.filter(c=>c.label==='supported').length,partial:claims.filter(c=>c.label==='partial').length,unsupported:claims.filter(c=>c.label==='unsupported').length,invalid_references:ok.reduce((n,r)=>n+(r.grade?.detail?.citation?.invalid_reference_count||0),0)},
  system_confident_rate:rate(ok,r=>r.confident===true),empty_retrieval:ok.filter(r=>!r.source_count).length,
  latency_ms:{n:lat.length,p50:percentile(lat,0.5),p95:percentile(lat,0.95),max:lat.length?Math.max(...lat):null}};}
