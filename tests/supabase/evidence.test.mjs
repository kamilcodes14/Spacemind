import test from 'node:test';
import assert from 'node:assert/strict';
import {rerankSources,verifyClaims,citedClaims} from '../../supabase/functions/_shared/evidence.js';
import {partialAnswer,streamCompletion} from '../../supabase/functions/_shared/stream.js';
import {readResearchStream} from '../../frontend/research-stream.js';
const sources=[{source_file:'Mars',snippet:'Mars has polar ice. Its atmosphere is thin.',url:'https://nasa.gov/mars'},{source_file:'Sun',snippet:'The Sun is a star.',url:'https://nasa.gov/sun'}];
const complete=object=>async()=>JSON.stringify(object);
test('reranking promotes query-relevant evidence and fails safely on invalid indices',async()=>{
 const good=await rerankSources('Sun',sources,{env:{},complete:complete({ranking:[{index:1,relevance:.95},{index:0,relevance:.1}]})});assert.equal(good.sources[0].source_file,'Sun');assert.equal(good.degraded,false);
 const bad=await rerankSources('Sun',sources,{env:{},complete:complete({ranking:[{index:99,relevance:1}]})});assert.equal(bad.degraded,true);assert.deepEqual(bad.sources,sources);
});
test('verification accepts only direct quotes from the actually cited source',async()=>{
 const answer='Mars has polar ice [1]. The Sun is a star [2].';assert.equal(citedClaims(answer).length,2);
 const r=await verifyClaims(answer,sources,complete({claims:[{id:0,status:'supported',evidence:[{citation:1,quote:'Mars has polar ice'}]},{id:1,status:'supported',evidence:[{citation:2,quote:'Invented supporting quote'}]}]}));assert.equal(r.claims[0].status,'supported');assert.equal(r.claims[1].status,'unverified');assert.equal(r.claims[1].evidence.length,0);
});
test('missing and duplicate verification rows fail closed',async()=>{
 for(const claims of [[],[{id:0,status:'supported'},{id:0,status:'supported'}]]){const r=await verifyClaims('Mars ice [1]. Sun star [2].',sources,complete({claims}));assert.equal(r.complete,false);assert(r.claims.every(c=>c.status==='unverified'));}
});
test('out-of-range citations cannot become supported',async()=>{const r=await verifyClaims('Mars has cities [99].',sources,complete({claims:[{id:0,status:'supported',evidence:[{citation:1,quote:'Mars has polar ice'}]}]}));assert.equal(r.claims[0].status,'unsupported');});
test('citations following sentence punctuation stay attached',()=>{assert.equal(citedClaims('Mars has polar ice. [1] The Sun is a star. [2]').length,2);});
test('partial JSON answer never emits reasoning or incomplete escapes',()=>{
 const json=JSON.stringify({answer:'Mars "ice"\n🌌',confident:true});let previous='';for(let i=0;i<=json.length;i++){const text=partialAnswer(json.slice(0,i));assert(text.startsWith(previous));previous=text;}assert.equal(previous,'Mars "ice"\n🌌');assert.equal(partialAnswer('{"reasoning":"secret"}'),'');
});
function bytes(text,step=1){const data=new TextEncoder().encode(text);return new ReadableStream({start(c){for(let i=0;i<data.length;i+=step)c.enqueue(data.slice(i,i+step));c.close();}});}
test('real provider token frames reach callback before final JSON, including UTF8',async()=>{
 const text=JSON.stringify({answer:'Mars 🌌 [1].',confident:true});const frames=[...text].map(content=>'data: '+JSON.stringify({choices:[{delta:{content}}]})+'\n\n').join('')+'data: {"choices":[{"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n';let draft='';const raw=await streamCompletion([],{},async()=>new Response(bytes(frames)),t=>draft+=t);assert.equal(JSON.parse(raw).answer,draft);
});
test('frontend requires done and propagates stream errors',async()=>{
 const frame='event: delta\ndata: {"text":"hi 🌌"}\n\n';await assert.rejects(readResearchStream(new Response(bytes(frame),{headers:{'Content-Type':'text/event-stream'}})),/interrupted/);
 const final=frame+'event: done\ndata: {"answer":"hi 🌌"}\n\n';let received='';assert.equal((await readResearchStream(new Response(bytes(final),{headers:{'Content-Type':'text/event-stream'}}),(e,d)=>received+=d.text)).answer,'hi 🌌');assert.equal(received,'hi 🌌');
 await assert.rejects(readResearchStream(new Response(bytes('event: error\ndata: {"detail":"save failed"}\n\n'),{headers:{'Content-Type':'text/event-stream'}})),/save failed/);
});

test('decimal measurements are preserved within individual claims',()=>{const claims=citedClaims('The mass is 1.5 solar masses [1]. It is warm [2].');assert.equal(claims.length,2);assert.match(claims[0].text,/1\.5/);});
