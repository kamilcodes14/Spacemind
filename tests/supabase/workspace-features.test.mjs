import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePaperRequest,selectedEvidence} from '../../supabase/functions/_shared/paper-tools.js';
import {research,groq} from '../../supabase/functions/_shared/research.js';
import {streamCompletion} from '../../supabase/functions/_shared/stream.js';
import {discover} from '../../supabase/functions/paper-discovery/providers.js';
import {parseArxiv,digestRows} from '../../supabase/functions/daily-digest/ingest.js';
import {queryProvider} from '../../supabase/functions/space-data/providers.js';
import {cachedProvider} from '../../supabase/functions/_shared/provider-cache.js';
const id='11111111-1111-4111-8111-111111111111';
const response=x=>new Response(JSON.stringify(x),{headers:{'Content-Type':'application/json'}});
test('paper task validation rejects missing, duplicate, foreign-shaped and excessive selections',()=>{
 assert.throws(()=>validatePaperRequest({paper_task:'compare',paper_ids:[id]}));
 assert.throws(()=>validatePaperRequest({paper_ids:[id,id]}));
 assert.throws(()=>validatePaperRequest({paper_ids:['../../users']}));
 assert.throws(()=>validatePaperRequest({paper_task:'pretend'}));
 assert.equal(validatePaperRequest({paper_ids:[id],paper_task:'summary'}).paperTask,'summary');
});
test('selected-paper retrieval is bounded and retains paper/page provenance',()=>{
 const pages=Array.from({length:10},(_,i)=>({page:i+1,text:(i===7?'Mars ice. ':'Background. ').repeat(1000)}));
 const sources=selectedEvidence([{id,title:'A',pages},{id:'b',title:'B',pages:[{page:1,text:'Other paper'}]}],'Mars');
 assert.equal(sources.length,4);assert.equal(sources[0].page,8);assert.equal(sources[0].doc_id,id);assert(sources.every(s=>s.snippet.length<=4000));assert(sources.some(s=>s.doc_id==='b'));
});
test('selected-paper chat never searches another corpus or routes a casual query away from selected evidence',async()=>{
 let fetched=0;const result=await research({question:'hello',paperIds:[id],paperTask:'summary',useWeb:null},[],{env:{},lookupPapers:()=>{throw Error('Must not search');},selectedSources:[],fetcher:async()=>{fetched++;throw Error();}});
 assert.equal(fetched,0);assert.equal(result.confident,false);assert.equal(result.citations.length,0);
});
test('model-level quota failure falls back to the second configured model',async()=>{
 const models=[];const result=await groq([{role:'user',content:'test'}],{GROQ_API_KEY:'test'},async(url,o)=>{const body=JSON.parse(o.body);models.push(body.model);return models.length===1?new Response('',{status:429}):response({choices:[{message:{content:'Recovered'},finish_reason:'stop'}]});});
 assert.equal(result,'Recovered');assert.deepEqual(models,['openai/gpt-oss-120b','openai/gpt-oss-20b']);
});
test('stream fallback happens before tokens, and mid-stream failure is never combined with another model',async()=>{
 let calls=0;const text=JSON.stringify({answer:'Recovered'});let draft='';
 const result=await streamCompletion([],{GROQ_API_KEY:'test'},async()=>{calls++;return calls===1?new Response('',{status:429}):new Response('data: '+JSON.stringify({choices:[{delta:{content:text},finish_reason:'stop'}]})+'\n\ndata: [DONE]\n\n');},s=>draft+=s);
 assert.equal(JSON.parse(result).answer,draft);assert.equal(calls,2);
 calls=0;await assert.rejects(streamCompletion([],{GROQ_API_KEY:'test'},async()=>{calls++;return new Response('data: '+JSON.stringify({choices:[{delta:{content:text}}]})+'\n\n');},()=>{}));assert.equal(calls,1);
});
test('citation graph keeps available relationships and reports upstream failures',async()=>{
 const r=await discover({kind:'graph',paper_id:'ARXIV:2401.12345'},{},async url=>url.includes('references')?response({data:[{citedPaper:{paperId:'a',title:'Prior work',authors:[]}}]}):new Response('',{status:429}));
 assert.equal(r.groups.References[0].title,'Prior work');assert.equal(r.warnings.length,2);
 await assert.rejects(discover({kind:'graph',paper_id:'https://evil.test'},{}));
});
test('arXiv digest parses escaped bibliographic metadata and does not expand XML entities',async()=>{
 const xml='<feed><entry><id>http://arxiv.org/abs/2610.12345v1</id><title>A &amp; B</title><summary>Ice &lt; water</summary><author><name>A. Scientist</name></author><published>2026-10-12</published><category term="astro-ph.EP"/></entry></feed>';
 const p=parseArxiv(xml)[0];assert.equal(p.title,'A & B');assert.equal(p.content,'Ice < water');assert.deepEqual(p.categories,['astro-ph.EP']);assert.equal(p.year,2026);
 const rows=await digestRows(async()=>new Response(xml));assert.equal(rows[0].id,'digest:2610.12345v1');assert.equal(rows[0].embedding,null);
});
test('catalogue adapters use fixed endpoints and preserve Gaia 64-bit identifiers',async()=>{
 let url;const r=await queryProvider({kind:'gaia',params:{ra:1,dec:2,radius:.1}},async u=>{url=u;return new Response('{"metadata":[{"name":"source_id"},{"name":"parallax"}],"data":[[139476043578014592,11.04]]}');});
 assert.equal(r.rows[0].source_id,'139476043578014592');assert.equal(r.rows[0].parallax,11.04);assert.equal(new URL(url).hostname,'gea.esac.esa.int');
 await assert.rejects(queryProvider({kind:'gaia',params:{ra:'1); DROP TABLE',dec:2,radius:.1}},async()=>{}));
});
test('cache shares public provider results and rejects a held global ephemeris lease',async()=>{
 const chain={select(){return this},eq(){return this},gt(){return this},async maybeSingle(){return {data:{value:{rows:[1]}}}}};
 let called=false;const cached=await cachedProvider({from:()=>chain},'key',async()=>{called=true;});assert.equal(cached.cached,true);assert.equal(called,false);
 chain.maybeSingle=async()=>({data:null});await assert.rejects(cachedProvider({from:()=>chain,rpc:async()=>({data:false})},'key',async()=>{}, {serialized:true}),/busy/);
});
