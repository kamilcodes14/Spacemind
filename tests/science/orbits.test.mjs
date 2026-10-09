import test from 'node:test';
import assert from 'node:assert/strict';
import {elements,hohmann,position,impulse,lagrange,groundPoint,BODIES,AU} from '../../frontend/science/orbits.js';
import {recipe} from '../../frontend/science/recipes.js';
import {validateTool,toolResult} from '../../supabase/functions/_shared/science-tools.js';
const near=(a,b,tol)=>assert.ok(Math.abs(a-b)<tol,`${a} vs ${b}`);
test('400 km Earth orbit: period, speed, and angular momentum',()=>{
 const el=elements({body:'Earth',periapsis:400,apoapsis:400,inclination:51.6});near(el.period/60,92.56,.02);near(el.vp,7.6686,.0001);
 near(Math.hypot(...position(el,Math.PI)),el.rp,1e-8);
 const elliptic=elements({body:'Earth',periapsis:400,apoapsis:35786,inclination:0});near(elliptic.rp*elliptic.vp,elliptic.ra*elliptic.va,1e-7);
});
test('LEO-GEO transfer and reverse transfer have consistent delta-v',()=>{
 const mu=BODIES.Earth.mu,r1=6778.137,r2=42164.137,r=hohmann(mu,r1,r2);near(r.total,3.854,.002);near(r.seconds/3600,5.29,.02);
 const reverse=hohmann(mu,r2,r1);near(reverse.total,r.total,1e-12);assert.ok(reverse.dv1<0&&reverse.dv2<0);near(hohmann(mu,r1,r1).total,0,1e-12);
});
test('Earth-Mars ideal heliocentric Hohmann flight time',()=>{const r=hohmann(BODIES.Sun.mu,AU,1.523679*AU);near(r.seconds/86400,258.87,.1);near(r.total,5.594,.02);});
test('burn model zero, escape and collision cases',()=>{const el=elements({body:'Earth',periapsis:400,apoapsis:400,inclination:0});near(impulse(el,0,0).apoapsis,400,1e-3);assert.equal(impulse(el,0,4).apoapsis,null);assert.ok(impulse(el,0,-2).periapsis<0);});
test('Lagrange points satisfy force balance',()=>{const mu=.0121505856;const p=lagrange(mu);near(p[0][0],.8369151,1e-6);near(p[1][0],1.1556822,1e-6);for(const [x]of p.slice(0,3))near(x-(1-mu)*(x+mu)/Math.abs(x+mu)**3-mu*(x-1+mu)/Math.abs(x-1+mu)**3,0,1e-10);});
test('ground coordinates and validation do not invent defaults',()=>{assert.deepEqual(groundPoint([1,0,0],0),{lon:0,lat:0});assert.throws(()=>elements({body:'Earth',periapsis:500,apoapsis:400,inclination:0}));assert.throws(()=>validateTool({kind:'rocket',params:{isp:320,wet:1000}}));assert.throws(()=>recipe('spice',{target:'1;import os',observer:'399',epoch:'2026-01-01T00:00:00Z'}));assert.throws(()=>validateTool({kind:'horizons',params:{target:'301',observer:'399',epoch:'tomorrow'}}));});
test('validated tool envelope is safe to save and replay',()=>{const r=toolResult({tool:{kind:'hohmann',params:{body:'Earth',start:400,end:35786}},answer:'Calculate the ideal transfer.'});assert.equal(JSON.parse(r.citations[0].snippet).kind,'hohmann');assert.equal(r.citations[0].origin,'spacemind-tool-v1');});

test('post-burn conic agrees with independent apsides and the inclined plane',async()=>{
 const {impulsePath}=await import('../../frontend/science/orbits.js');const el=elements({body:'Earth',periapsis:400,apoapsis:400,inclination:51.6});
 const predicted=impulse(el,.2,.4),points=impulsePath(el,.2,.4,1024),radii=points.map(p=>Math.hypot(...p));
 near(Math.min(...radii)-el.radius,predicted.periapsis,1e-5);near(Math.max(...radii)-el.radius,predicted.apoapsis,1e-5);
 for(const p of points)near(p[2]*Math.cos(el.inclination)-p[1]*Math.sin(el.inclination),0,1e-8);
 assert(impulsePath(el,0,4).every(p=>p.every(Number.isFinite)));
});
