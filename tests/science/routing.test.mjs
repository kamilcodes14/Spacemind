import test from 'node:test';
import assert from 'node:assert/strict';
import {research} from '../../supabase/functions/_shared/research.js';
const input={question:'Calculate a 400 km to GEO Hohmann transfer',chatId:'33333333-3333-4333-8333-333333333333',depth:'technical',useWeb:null};
const run=tool=>research(input,[],{env:{GROQ_API_KEY:'test'},lookupPapers:()=>assert.fail('science must not fall back to researched guesses'),fetcher:async()=>Response.json({choices:[{message:{content:JSON.stringify({mode:'science',answer:'Assuming circular coplanar Earth orbits.',tool})}}]})});
test('chat routes calculations to a replayable executable tool',async()=>{const result=await run({kind:'hohmann',params:{body:'Earth',start:400,end:35786}});assert.equal(result.citations[0].origin,'spacemind-tool-v1');assert.equal(JSON.parse(result.citations[0].snippet).params.end,35786);});
test('invalid calculation inputs ask for clarification rather than generating numbers',async()=>{const result=await run({kind:'hohmann',params:{body:'Earth',start:400}});assert.match(result.answer,/valid inputs/);assert.deepEqual(result.citations,[]);});
