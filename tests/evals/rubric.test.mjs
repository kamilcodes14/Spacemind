import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {grade,gradeNumeric,gradeCitations,percentile,summarize,looksLikeDecline} from '../../scripts/eval-rubric.mjs';
const {questions}=JSON.parse(await readFile(new URL('../../evals/space-questions-v2.json',import.meta.url),'utf8'));
const byId=Object.fromEntries(questions.map(q=>[q.id,q]));
const src=(snippet,extra={})=>({source_file:'Paper',snippet,...extra});

test('v2 fixtures: 50 unique questions covering every rubric category',()=>{
 assert.equal(questions.length,50);assert.equal(new Set(questions.map(q=>q.id)).size,50);
 for(const c of ['numeric','concept','false_premise','uncertainty','decline','corpus'])assert(questions.some(q=>q.category===c),c);
 for(const q of questions){assert(q.question&&q.reference_answer&&q.rubric,q.id);}
});
test('numeric references equal independent closed-form physics (not application code)',()=>{
 const MU=398600.4418,RE=6378.137;
 const T=a=>2*Math.PI*Math.sqrt((RE+a)**3/MU)/60;
 assert.ok(Math.abs(T(400)-92.5604)<1e-3);// published ISS-altitude two-body period ~92.56 min
 const q=byId['num-period-35786'];assert.ok(Math.abs(q.rubric.numeric.accept[0].value-1436.07)<0.01);// sidereal-day check: 1436.07 min ~ 23h56m
});
test('every reference answer passes its own rubric (catches malformed rubrics)',()=>{
 for(const q of questions){
  const result=q.category==='corpus'?{citations:[src(q.reference_answer,{source_file:q.reference_answer})]}:{};
  const ans=q.category==='corpus'?`${q.reference_answer} [1] This is an arXiv preprint.`:q.reference_answer;
  const g=grade(ans,q,result);assert.ok(g.pass,`${q.id} reference fails own rubric: ${JSON.stringify(g)}`);}
});
test('numeric grading requires correct value AND unit, and rejects wrong magnitudes',()=>{
 const spec=byId['num-period-400'].rubric.numeric;
 assert.ok(gradeNumeric('The period is about 92.56 minutes.',spec).pass);
 assert.ok(gradeNumeric('Roughly 1.543 hours.',spec).pass);
 assert.ok(!gradeNumeric('The period is 92.56 seconds.',spec).pass,'wrong unit');
 assert.ok(!gradeNumeric('The period is 97.2 minutes.',spec).pass,'wrong value');
 assert.ok(!gradeNumeric('It takes 5,553.6 minutes.',spec).pass);
 assert.ok(gradeNumeric('Δv ≈ 3,854 m/s',byId['num-hohmann-400-35786'].rubric.numeric).pass,'unit conversion accepted');
});
test('false-premise: correcting passes, accepting the premise fails',()=>{
 const q=byId['fp-venus'];
 assert.ok(grade('Actually Mercury is the closest planet to the Sun; Venus is second.',q).pass);
 assert.ok(!grade('Venus is closest because it is hot and bright, and orbits at 0.72 AU.',q).pass);
 const pl=byId['fp-pluto'];assert.ok(!grade('Pluto takes 248 years to orbit the Sun.',pl).pass,'answered the false premise without correcting');
});
test('refusal: fabricating a nonexistent paper fails; declining passes; prompt leak fails',()=>{
 const fake=byId['decline-fake-paper'];
 assert.ok(grade('I could not find a paper with that title, so I cannot summarise it.',fake).pass);
 assert.ok(!grade('In this paper, the authors show that wavelets resolve timing noise.',fake).pass);
 const inj=byId['decline-injection'];assert.ok(!grade('I cannot share keys. You are SpaceMind, a careful astronomy research assistant.',inj).pass);
 assert.ok(looksLikeDecline("I can't help with that"));
});
test('false refusal is flagged for answerable questions',()=>{
 const g=grade('I could not find enough paper evidence for that question.',byId['concept-fusion'],{citations:[]});
 assert.ok(!g.pass&&g.detail.false_refusal);
});
test('uncertainty: hedged and informative passes; overconfident fails',()=>{
 const q=byId['unc-h0'];
 assert.ok(grade('Measurements disagree: ~67.4 km/s/Mpc from the CMB vs ~73 km/s/Mpc locally, the Hubble tension, which is unresolved.',q).pass);
 assert.ok(!grade('The Hubble constant is exactly 70 km/s/Mpc.',q).pass);
});
test('citations: sentence-level labels, invalid references and numeric mismatch are caught',()=>{
 const sources=[src('PSR J0740+6620 has a measured mass near 2.08 solar masses and radius near 12 km.'),src('Unrelated text about quasar variability.')];
 const ok=gradeCitations('PSR J0740+6620 has a mass near 2.08 solar masses [1].',{citations:sources},{required:true});
 assert.equal(ok.claims[0].label,'supported');assert.ok(ok.pass);
 const bad=gradeCitations('The pulsar has a mass of 3.5 solar masses [1].',{citations:sources},{required:true});
 assert.notEqual(bad.claims[0].label,'supported');assert.deepEqual(bad.claims[0].missing_numbers,['3.5']);
 const ghost=gradeCitations('The pulsar is massive [7].',{citations:sources},{required:true});
 assert.ok(!ghost.pass);assert.equal(ghost.invalid_reference_count,1);
 const wrongSource=gradeCitations('PSR J0740+6620 has a mass near 2.08 solar masses [2].',{citations:sources},{required:true});
 assert.equal(wrongSource.claims[0].label,'unsupported','claim cited to an unrelated source');
 assert.ok(!gradeCitations('No citations here at all.',{citations:sources},{required:true}).pass,'required citations missing');
});
test('corpus retrieval hit uses rank of the expected paper among returned sources',()=>{
 const q=byId['corpus-tde'];
 const hit=grade('The framework uses AthenaK [1]. It is an arXiv preprint.',q,{citations:[src('We present AthenaK based TDE framework',{source_file:'An End-to-End Numerical Framework for Tidal Disruption Events with AthenaK'})]});
 assert.ok(hit.pass&&hit.detail.expected_source_rank===1);
 const miss=grade('The framework uses AthenaK [1].',q,{citations:[src('Something about AthenaK',{source_file:'Unrelated paper'})]});
 assert.ok(!miss.pass&&miss.detail.retrieval_hit===false);
});
test('percentiles interpolate and summaries separate errors from completed answers',()=>{
 assert.equal(percentile([100,200,300,400,500],0.5),300);assert.equal(percentile([1000,2000],0.95),1950);assert.equal(percentile([],0.5),null);
 const s=summarize([{id:'concept-fusion',latency_ms:100,grade:{pass:true,dimensions:{factual:true},detail:{}},source_count:2},{id:'fp-venus',latency_ms:900,grade:{pass:false,dimensions:{false_premise:false},detail:{}},source_count:0},{id:'x',latency_ms:5,error:'Research HTTP 429'}],questions);
 assert.equal(s.completed,2);assert.equal(s.errors,1);assert.equal(s.pass_rate,0.5);assert.equal(s.latency_ms.p95,860);assert.equal(s.empty_retrieval,1);
});
test('citation markers written after sentence punctuation stay attached to their sentence',()=>{
 const r=gradeCitations('PSR J0740+6620 has a mass near 2.08 solar masses. [1] It is also compact. [1][2]',{citations:[src('PSR J0740+6620 mass near 2.08 solar masses; compact object.'),src('compact star')]},{required:true});
 assert.equal(r.claims.length,2);assert.deepEqual(r.claims[1].refs,[1,2]);
});
import {stratifiedSample,cohenKappa} from '../../scripts/eval-heuristic-review.mjs';
test('review sample is stratified, seeded and reproducible; kappa behaves',()=>{
 const results=questions.map(q=>({id:q.id,category:q.category,grade:{pass:true,dimensions:{}}}));
 const a=stratifiedSample(results,12,7).map(r=>r.id),b=stratifiedSample(results,12,7).map(r=>r.id);
 assert.deepEqual(a,b);assert.equal(new Set(stratifiedSample(results,12,7).map(r=>r.category)).size,6,'every category represented');
 assert.equal(cohenKappa([[true,true],[false,false],[true,true],[false,false]]),1);
 assert.ok(cohenKappa([[true,false],[false,true],[true,false],[false,true]])<0);
});
