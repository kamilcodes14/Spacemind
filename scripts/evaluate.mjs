import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {elements,hohmann,BODIES} from '../frontend/science/orbits.js';
import {dimensions} from './eval-review.mjs';
const cases=JSON.parse(await readFile('evals/space-questions.json','utf8'));
assert.equal(cases.length,50);assert.equal(new Set(cases.map(c=>c.id)).size,50);
let numerical=0;
for(const c of cases){
 assert(c.question&&c.gold_answer&&c.category&&c.mode);
 for(const d of dimensions)assert(c.rubric[d],`${c.id}: missing ${d}`);
 if(c.numeric){const p=c.numeric,b=BODIES.Earth;const actual=p.kind==='period'?elements({body:'Earth',periapsis:p.altitude,apoapsis:p.altitude,inclination:0}).period/60:hohmann(b.mu,b.radius+p.start,b.radius+p.end).total;assert(Math.abs(actual-p.value)<=p.tolerance,c.id+' numerical regression');numerical++;}
}
assert(cases.some(c=>c.category==='false_premise'));assert(cases.some(c=>c.category==='future_date'));
console.log(`PASS: ${cases.length} rubric schemas; ${numerical} numerical regressions. These are offline checks, not a model-quality score.`);
if(process.argv.includes('--live'))await import('./evaluate-stack.mjs');
if(process.argv.includes('--model-only'))throw Error('Model-only scoring was retired: use deployed capture and independent rubric review.');
