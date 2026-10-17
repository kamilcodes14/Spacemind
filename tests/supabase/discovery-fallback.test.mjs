import test from 'node:test';
import assert from 'node:assert/strict';
import {discoverWithFallback} from '../../supabase/functions/paper-discovery/providers.js';
test('archive outage uses authenticated corpus search and deduplicates documents with explicit provenance',async()=>{
 let calls=0;
 const client={rpc:async(name,args)=>{calls++;assert.equal(name,'match_papers_hybrid');assert.equal(args.query_embedding,null);assert.equal(args.query_text,'exoplanets');return {data:[{doc_id:'a',title:'Paper A',content:'Evidence',url:'https://arxiv.org/abs/1234.5678',origin:'arxiv'},{doc_id:'a',title:'Paper A',content:'Second page'},{doc_id:'b',title:'Paper B',content:'Abstract',origin:'arxiv_abstract'}]};}};
 const result=await discoverWithFallback({kind:'scholar',query:'exoplanets'},{},client,async()=>new Response('{}',{status:429}));
 assert.equal(calls,1);assert.equal(result.papers.length,2);assert.equal(result.source,'imported_corpus');assert.match(result.warnings[0],/not live/);assert.equal(result.papers[1].origin,'arxiv_abstract');
});
test('successful live discovery and invalid inputs do not invoke fallback',async()=>{
 const client={rpc:()=>assert.fail('must not query fallback')};
 const result=await discoverWithFallback({kind:'scholar',query:'exoplanets'},{},client,async()=>Response.json({data:[{title:'Live paper'}]}));
 assert.equal(result.papers[0].title,'Live paper');assert.equal(result.source,undefined);
 await assert.rejects(discoverWithFallback({kind:'scholar',query:''},{},client),/query/);
 await assert.rejects(discoverWithFallback({kind:'ads',query:'exoplanets'},{},client),/unavailable/);
});
test('fallback database failure preserves the provider failure',async()=>{
 await assert.rejects(discoverWithFallback({kind:'scholar',query:'exoplanets'},{},{rpc:async()=>({error:{message:'denied'}})},async()=>new Response('{}',{status:503})),e=>e.status===503);
});
