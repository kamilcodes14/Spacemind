import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHorizons,queryProvider} from '../../supabase/functions/space-data/providers.js';
import {makeHandler} from '../../supabase/functions/space-data/handler.js';
test('Horizons parser uses actual vector records and rejects ambiguous lookups',()=>{
 const r=parseHorizons({result:'header\n$$SOE\n2461041.5, A.D. 2026-Jan-01 00:00:00, 1,2,3,.1,.2,.3,\n$$EOE\nfooter',signature:{version:'1.3'}});assert.equal(r.rows[0].z_km,3);assert.equal(r.rows[0].vz_km_s,.3);assert.throws(()=>parseHorizons({result:'Multiple matches'}));assert.throws(()=>parseHorizons({error:'No coverage'}));assert.throws(()=>parseHorizons({result:'$$SOE\nwrong\n$$EOE'}));
});
test('provider URL cannot be overridden; UTC and frame are explicit',async()=>{
 let called;await queryProvider({kind:'horizons',params:{target:'301',observer:'399',epoch:'2026-01-01T00:00:00Z',url:'https://evil.test'}},async u=>{called=new URL(u);return Response.json({result:'$$SOE\n1,epoch,1,2,3,4,5,6,\n$$EOE'});});assert.equal(called.hostname,'ssd.jpl.nasa.gov');assert.equal(called.searchParams.get('TIME_TYPE'),"'UT'");assert.equal(called.searchParams.get('REF_PLANE'),"'FRAME'");
});
test('MAST cone search and raw/processed product links preserve archive metadata',async()=>{
 let request;const data=await queryProvider({kind:'mast-products',params:{obsid:'123'}},async(u,o)=>{request=JSON.parse(new URLSearchParams(o.body).get('request'));return Response.json({status:'COMPLETE',data:[{dataURI:'mast:JWST/product/example_uncal.fits',productFilename:'example_uncal.fits',calib_level:1}]});});assert.equal(request.service,'Mast.Caom.Products');assert.match(data.rows[0].url,/uri=mast%3AJWST/);assert.equal(data.rows[0].calibration_level,1);
});
test('NOAA partial failure preserves available feeds and flags limitation',async()=>{const data=await queryProvider({kind:'weather',params:{}},async u=>u.includes('flares')?new Response('',{status:503}):Response.json([['time','Kp'],['2026-01-01',1]]));assert.equal(data.warnings.length,1);assert.ok(data.rows.kp);});
test('upstream throttling is not fabricated data',async()=>{await assert.rejects(()=>queryProvider({kind:'launches',params:{}},async()=>new Response('',{status:429})),e=>e.status===429);});
test('data endpoint authenticates before contacting any provider',async()=>{let calls=0;const h=makeHandler({createClient:()=>{throw Error('not reached');},env:{},fetcher:async()=>{calls++;}});const r=await h(new Request('https://example.test',{method:'POST',body:'{}'}));assert.equal(r.status,401);assert.equal(calls,0);});
