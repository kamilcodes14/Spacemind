import test from 'node:test';
import assert from 'node:assert/strict';
import {research} from '../../supabase/functions/_shared/research.js';
const input={question:'Calculate a 400 km to GEO Hohmann transfer',chatId:'33333333-3333-4333-8333-333333333333',depth:'technical',useWeb:null};
const run=tool=>research(input,[],{env:{GROQ_API_KEY:'test'},lookupPapers:()=>assert.fail('science must not fall back to researched guesses'),fetcher:async()=>Response.json({choices:[{message:{content:JSON.stringify({mode:'science',answer:'Assuming circular coplanar Earth orbits.',tool})}}]})});
test('chat routes calculations to a replayable executable tool',async()=>{const result=await run({kind:'hohmann',params:{body:'Earth',start:400,end:35786}});assert.equal(result.citations[0].origin,'spacemind-tool-v1');assert.equal(JSON.parse(result.citations[0].snippet).params.end,35786);});
test('invalid calculation inputs ask for clarification rather than generating numbers',async()=>{const result=await run({kind:'hohmann',params:{body:'Earth',start:400}});assert.match(result.answer,/valid inputs/);assert.deepEqual(result.citations,[]);});
test('chat can return replayable NASA asteroid tool inputs',async()=>{const tool={kind:'asteroids',params:{start_date:'2026-10-30',end_date:'2026-11-05'}};const result=await run(tool);assert.deepEqual(JSON.parse(result.citations[0].snippet),tool);});
test('explicit NASA dates route directly without model-generated arguments',async()=>{
 const result=await research({...input,question:'Fetch NASA NeoWs asteroid close approaches from 2026-10-29 through 2026-10-29 UTC'},[],{env:{GROQ_API_KEY:'test'},fetcher:()=>assert.fail('explicit dates need no model'),lookupPapers:()=>assert.fail('no papers needed')});
 assert.deepEqual(JSON.parse(result.citations[0].snippet),{kind:'asteroids',params:{start_date:'2026-10-29',end_date:'2026-10-29'}});
});
test('explicit NASA invalid ranges ask for dates rather than central-body inputs',async()=>{
 const result=await research({...input,question:'Show asteroid close approaches from 2026-10-29 to 2026-11-05'},[],{env:{GROQ_API_KEY:'test'},fetcher:()=>assert.fail('invalid range needs no model')});
 assert.match(result.answer,/seven calendar days/);assert.deepEqual(result.citations,[]);
});
