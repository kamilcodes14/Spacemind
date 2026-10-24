import test from 'node:test';
import assert from 'node:assert/strict';
import {dimensions,digest,reviewTemplate,validateReview,summarize,sentences,representativeSample} from '../../scripts/eval-review.mjs';
const item={id:'x',category:'concept',gold_answer:'Mars has ice.',rubric:{}};
const result={id:'x',answer:'Mars has polar ice [1].',citations:[{snippet:'Mars has polar ice.',url:'https://example.org'}],latency_ms:100};
function reviewed(){const r=reviewTemplate(result,item);r.reviewer='Independent reviewer';r.reviewed_at='2026-10-24T00:00:00Z';for(const d of dimensions){r.scores[d]=2;r.rationale[d]='Compared with reference and captured evidence.';}r.sentences[0]={...r.sentences[0],factual:true,status:'supported',rationale:'Direct evidence',evidence:[{citation:1,quote:'Mars has polar ice',locator:'https://example.org, paragraph 1'}]};return r;}
test('unreviewed responses and keyword-filled nonsense never count as passed',()=>{
 const r=reviewTemplate(result,item);assert(validateReview(r,result,item).length>0);
 const s=summarize({results:[{...result,review:r,review_valid:false}]});assert.equal(s.quality_pass,false);assert.equal(s.scores.factual_correctness.mean,null);assert.equal(s.citation_precision,null);
});
test('review binds to exact captured answer and evidence',()=>{
 assert.deepEqual(validateReview(reviewed(),result,item),[]);
 assert(validateReview(reviewed(),{...result,answer:'Changed'},item).length);
 assert(validateReview(reviewed(),{...result,citations:[]},item).length);
});
test('fabricated supporting quote and wrong citation cannot pass',()=>{
 for(const e of [{citation:1,quote:'Invented quotation',locator:'p1'},{citation:2,quote:'Mars has polar ice',locator:'p1'}]){const r=reviewed();r.sentences[0].evidence=[e];assert(validateReview(r,result,item).length);}
});
test('uncited sentences remain in the review and full support rejects missing coverage',()=>{
 assert.equal(sentences('Mass is 1.5 solar masses [1]. Invented claim.').length,2);
 const r=reviewed();r.sentences[0].status='unsupported';r.sentences[0].evidence=[];assert(validateReview(r,result,item).some(e=>e.includes('contradicts')));
});
test('N/A cannot bypass required numerical, factual or refusal scoring',()=>{
 for(const d of ['factual_correctness','numerical_accuracy_units','refusal_correctness']){const r=reviewed();r.scores[d]='na';assert(validateReview(r,result,{...item,numeric:{value:1}}).length);}
});
test('nearest-rank latency excludes failures and empty reports have null percentiles',()=>{
 assert.equal(summarize({results:[]}).p50_ms,null);
 const s=summarize({results:[1,2,3,4].map(n=>({latency_ms:n*100})).concat({error:'failed',latency_ms:9999})});assert.equal(s.p50_ms,200);assert.equal(s.p95_ms,400);assert.equal(s.errors,1);
});
test('sample selection is deterministic and includes every challenge',()=>{
 const cases=[{id:'a',category:'concept'},{id:'b',category:'concept'},{id:'c',category:'future_date'},{id:'d',category:'false_premise'}];assert.deepEqual(representativeSample(cases),['a','b','c','d']);assert.equal(digest(cases),digest(cases));
});
