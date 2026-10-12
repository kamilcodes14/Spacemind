import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {elements,hohmann,BODIES} from '../frontend/science/orbits.js';
import {groq} from '../supabase/functions/_shared/research.js';
const cases=JSON.parse(await readFile('evals/space-questions.json','utf8'));
assert.equal(cases.length,50);assert.equal(new Set(cases.map(c=>c.id)).size,50);
export {grade} from './eval-grade.mjs';
import {grade} from './eval-grade.mjs';

let numerical=0;for(const c of cases){assert(c.question&&c.gold_answer);assert(grade(c.gold_answer,c),c.id+' malformed rubric');
 if(c.numeric){const p=c.numeric,b=BODIES.Earth;const actual=p.kind==='period'?elements({body:'Earth',periapsis:p.altitude,apoapsis:p.altitude,inclination:0}).period/60:hohmann(b.mu,b.radius+p.start,b.radius+p.end).total;assert(Math.abs(actual-p.value)<=p.tolerance,c.id+' numerical regression');numerical++;}
}
console.log(`PASS: ${cases.length} versioned gold questions; ${numerical} numerical answers checked against application calculations. Concept rubrics validated; offline checks do not evaluate model quality.`);
if(process.argv.includes('--live')){
 await import('./evaluate-stack.mjs');
}
if(process.argv.includes('--model-only')){
 if(!process.env.GROQ_API_KEY)throw Error('Live evaluation requires a protected GROQ_API_KEY environment secret. No model evaluation was run.');
 const report=[];
 for(const c of cases){try{const answer=await groq([{role:'system',content:'Answer this astronomy evaluation question concisely and accurately. State assumptions and units. Do not claim to have executed code.'},{role:'user',content:c.question}],process.env,fetch,false,2048);report.push({id:c.id,pass:grade(answer,c),answer});}catch(error){report.push({id:c.id,pass:false,error:error.message});}}
 await writeFile('evals/latest-report.json',JSON.stringify({created_at:new Date().toISOString(),rubric:'Automatic keyword/numeric check; human scientific review still required.',results:report},null,2));
 const passed=report.filter(r=>r.pass).length;console.log(`Live evaluation: ${passed}/${cases.length} passed.`);if(passed<45)process.exitCode=1;
}
