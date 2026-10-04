import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import * as Three from 'three';
const source=readFileSync(new URL('../../frontend/universe.js',import.meta.url),'utf8').replace("import * as THREE from 'three';",'');
function setup(fail=false){
 const callbacks=new Map(), events={}, media={matches:false,addEventListener(_,fn){events.reduced=fn;}};
 let renders=0,id=0; const points=[];
 const ctx=new Proxy({arc(x,y){points.push([x,y]);},getImageData(){return {data:new Uint8ClampedArray(512*512*4)};},createRadialGradient(){return {addColorStop(){}};},createLinearGradient(){return {addColorStop(){}};}},{get(t,k){return t[k]??(()=>{});}});
 const canvas={style:{},classList:{add(){}},getContext(){return ctx;},addEventListener(n,fn){events[n]=fn;}};
 const document={hidden:false,getElementById(){return canvas;},createElement(){return {...canvas};},addEventListener(n,fn){events[n]=fn;}};
 class Renderer {constructor(){if(fail)throw Error('no WebGL');}setClearColor(){}setSize(){}setPixelRatio(){}render(){renders++;}}
 const scope={THREE:{...Three,WebGLRenderer:Renderer},document,window:{},innerWidth:390,innerHeight:844,devicePixelRatio:3,matchMedia:()=>media,addEventListener(n,fn){events[n]=fn;},requestAnimationFrame(fn){callbacks.set(++id,fn);return id;},cancelAnimationFrame(i){callbacks.delete(i);}};
 scope.window=scope;vm.runInNewContext(source,scope);
 return {scope,document,media,canvas,events,callbacks,points,get renders(){return renders;},step(now){const tasks=[...callbacks.values()];callbacks.clear();tasks.forEach(fn=>fn(now));}};
}
test('original 3D scene initializes and motion obeys pause, visibility and reduced motion',()=>{
 const s=setup();assert.ok(s.renders>0);assert.equal(s.callbacks.size,1);
 s.step(100);s.step(140);assert.ok(s.renders>1);
 s.scope.SpaceUniverse.configure({motion:false});assert.equal(s.callbacks.size,0);
 s.scope.SpaceUniverse.configure({motion:true});assert.equal(s.callbacks.size,1);
 s.document.hidden=true;s.events.visibilitychange();assert.equal(s.callbacks.size,0);
 s.document.hidden=false;s.events.visibilitychange();assert.equal(s.callbacks.size,1);
 s.media.matches=true;s.events.reduced();assert.equal(s.callbacks.size,1); // Explicit resume takes priority.
 s.media.matches=false;s.events.reduced();assert.equal(s.callbacks.size,1);
 s.events.webglcontextlost({preventDefault(){}});assert.equal(s.callbacks.size,0);
 s.events.webglcontextrestored();assert.equal(s.callbacks.size,1);
 s.scope.SpaceUniverse.configure({speed:0});assert.equal(s.callbacks.size,0);
});
test('WebGL failure preserves settings and pauses the fallback',()=>{
 const s=setup(true);assert.equal(s.callbacks.size,1);
 s.points.length=0;s.step(100);s.step(140);const first=s.points.slice();
 s.points.length=0;s.step(180);assert.notDeepEqual(s.points,first);
 s.scope.SpaceUniverse.configure({motion:false});assert.equal(s.callbacks.size,0);
 s.scope.SpaceUniverse.configure({motion:true});assert.equal(s.callbacks.size,1);
 s.document.hidden=true;s.events.visibilitychange();assert.equal(s.callbacks.size,0);
});

test('reduced motion pauses by default but explicit play works in both renderers',()=>{
 for(const fail of [false,true]){
  const s=setup(fail);s.media.matches=true;s.events.reduced();assert.equal(s.callbacks.size,0);
  s.scope.SpaceUniverse.configure({motion:true,speed:.5});assert.equal(s.callbacks.size,1);
  s.scope.SpaceUniverse.configure({motion:false});assert.equal(s.callbacks.size,0);
 }
});
