import test from 'node:test';
import assert from 'node:assert/strict';
import {queryProvider} from '../../supabase/functions/space-data/providers.js';

test('NOAA weather provider fetches all four requested feeds and normalizes latest measurements',async()=>{
 const requested=[];
 const fetcher=async url=>{
  requested.push(String(url));
  if(String(url).includes('xray-flares')) return Response.json([{begin_time:'2026-11-20T01:00:00Z',max_time:'2026-11-20T01:05:00Z',max_class:'M2.1',end_time:'2026-11-20T01:10:00Z'}]);
  if(String(url).includes('plasma-7-day')) return Response.json([['time_tag','density','speed','temperature'],['2026-11-20T01:00:00Z','6.2','580','120000']]);
  if(String(url).includes('planetary-k-index')) return Response.json([['time_tag','Kp','a_running','station_count'],['2026-11-20T00:00:00Z','5.33','30','8']]);
  if(String(url).includes('mag-7-day')) return Response.json([['time_tag','bx_gsm','by_gsm','bz_gsm','bt'],['2026-11-20T01:00:00Z','1.2','-2.1','-8.4','9.1']]);
  if(String(url).includes('/products/alerts.json')) return Response.json([]);
  if(String(url).includes('/DONKI/CME')) return Response.json([]);
  if(String(url).includes('DONKI-API')) return Response.json([]);
  throw Error('Unexpected URL '+url);
 };
 const result=await queryProvider({kind:'weather',params:{}},fetcher,{});
 for(const path of ['/json/goes/primary/xray-flares-7-day.json','/products/solar-wind/plasma-7-day.json','/products/noaa-planetary-k-index.json','/products/solar-wind/mag-7-day.json']) assert.ok(requested.some(url=>url.includes(path)),path+' was not requested');
 assert.equal(result.latest.plasma.speed_km_s,580);
 assert.equal(result.latest.plasma.density_cm3,6.2);
 assert.equal(result.latest.plasma.temperature_k,120000);
 assert.equal(result.latest.kp.value,5.33);
 assert.equal(result.latest.mag.bz_gsm_nt,-8.4);
 assert.equal(result.latest.mag.bt_nt,9.1);
 assert.equal(result.rows.flares[0].max_class,'M2.1');
 assert.equal(result.observed_at.plasma,'2026-11-20T01:00:00Z');
 assert.equal(result.freshness.plasma.threshold_minutes,30);
 assert.match(result.note,/Kp is a 0–9/);
});

test('NOAA partial outages preserve healthy feeds and expose warnings',async()=>{
 const result=await queryProvider({kind:'weather',params:{}},async url=>{
  const u=String(url);
  if(u.includes('xray-flares')) return new Response('',{status:503});
  if(u.includes('DONKI')) return Response.json([]);
  if(u.includes('alerts')) return Response.json([]);
  if(u.includes('plasma-7-day')) return Response.json([['time_tag','density','speed','temperature'],['2026-11-20T01:00:00Z','5','450','90000']]);
  if(u.includes('planetary-k-index')) return Response.json([['time_tag','Kp'],['2026-11-20T00:00:00Z','2']]);
  if(u.includes('mag-7-day')) return Response.json([['time_tag','bz_gsm','bt'],['2026-11-20T01:00:00Z','-1','4']]);
  throw Error('Unexpected URL');
 });
 assert.ok(result.rows.plasma);
 assert.ok(result.rows.mag);
 assert.ok(result.warnings.some(w=>w.startsWith('flares')));
 assert.equal(result.latest.plasma.speed_km_s,450);
});

test('NOAA invalid tabular payload is reported as an unavailable feed, not a fabricated metric',async()=>{
 const result=await queryProvider({kind:'weather',params:{}},async url=>{
  const u=String(url);
  if(u.includes('xray-flares')||u.includes('alerts')) return Response.json([]);
  if(u.includes('DONKI')) return Response.json([]);
  if(u.includes('plasma-7-day')) return Response.json({unexpected:true});
  if(u.includes('planetary-k-index')) return Response.json([['time_tag','Kp'],['2026-11-20T00:00:00Z','3']]);
  if(u.includes('mag-7-day')) return Response.json([['time_tag','bz_gsm','bt'],['2026-11-20T01:00:00Z','-1','4']]);
  throw Error('Unexpected URL');
 });
 assert.equal(result.latest.plasma,null);
 assert.ok(result.warnings.some(w=>w.startsWith('plasma')));
});
