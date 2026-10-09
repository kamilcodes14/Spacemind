import * as THREE from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {elements,position,impulse,groundPoint,gmst,lagrange,impulsePath} from './orbits.js';
export function mountViewer(host,initial={body:'Earth',periapsis:400,apoapsis:400,inclination:51.6}){
 const wrap=document.createElement('div');wrap.className='orbit-card';const canvasHost=document.createElement('div');canvasHost.className='orbit-canvas';
 const grid=document.createElement('div');grid.className='science-fields';const controls={},params={...initial};
 function field(key,label,min,max,step){const l=document.createElement('label');l.textContent=label;const input=document.createElement('input');input.type='number';input.min=min;input.max=max;input.step=step;input.value=params[key];l.append(input);grid.append(l);controls[key]=input;input.onchange=update;}
 const bodyLabel=document.createElement('label');bodyLabel.textContent='Central body';const bodySelect=document.createElement('select');for(const name of ['Earth','Moon','Mars','Sun']){const option=document.createElement('option');option.value=name;option.textContent=name;bodySelect.append(option);}bodySelect.value=params.body;bodyLabel.append(bodySelect);grid.append(bodyLabel);bodySelect.onchange=()=>{params.body=bodySelect.value;j2.disabled=params.body!=='Earth';if(j2.disabled)j2.checked=false;track.hidden=params.body!=='Earth';time=0;update();reset.onclick();};
 field('periapsis','Periapsis altitude · km',1,1e10,10);field('apoapsis','Apoapsis altitude · km',1,1e10,10);field('inclination','Inclination · °',0,180,1);
 const extras=document.createElement('div');extras.className='science-fields';
 const makeRange=(label,min,max,step,value)=>{const l=document.createElement('label'),out=document.createElement('span'),i=document.createElement('input');i.type='range';Object.assign(i,{min,max,step,value});const refresh=()=>out.textContent=label+' · '+i.value;i.oninput=()=>{refresh();update();};refresh();l.append(out,i);extras.append(l);return i;};
 const count=makeRange('Satellites per plane',1,8,1,1),planes=makeRange('Planes',1,6,1,1),elevation=makeRange('Min. elevation °',0,60,1,10),radial=makeRange('Radial burn km/s',-3,3,.01,0),prograde=makeRange('Prograde burn km/s',-3,3,.01,0);
 const options=document.createElement('div');options.className='science-actions';const play=document.createElement('button');play.className='secondary';play.textContent='Play orbit';const reset=document.createElement('button');reset.className='secondary';reset.textContent='Reset view';
 const j2label=document.createElement('label');j2label.className='science-check';const j2=document.createElement('input');j2.type='checkbox';j2.disabled=params.body!=='Earth';j2label.append(j2,' Earth J2 nodal precession');j2.onchange=update;options.append(play,reset,j2label);
 const metrics=document.createElement('p');metrics.className='science-metrics';metrics.setAttribute('role','status');
 const note=document.createElement('p');note.className='science-note';note.textContent='Two-body illustration; spherical central body, no drag or third bodies. Optional J2 changes the ascending node only. Drag to rotate; scroll/pinch to zoom. The mint curve is the post-burn conic. Drag the gold burn handle in the orbital plane, or use the burn sliders. Coverage shows line of sight, not sensor performance.';
 const track=document.createElement('canvas');track.width=720;track.height=210;track.className='ground-track';track.setAttribute('aria-label','Earth longitude and latitude ground track over two orbital periods');track.hidden=params.body!=='Earth';
 wrap.append(canvasHost,grid,extras,options,metrics,track,note);host.append(wrap);
 let renderer;try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});}catch{canvasHost.textContent='3D graphics are unavailable on this device. Use the calculation tool for numerical results.';return ()=>{};}
 renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setClearColor(0x080f1d);canvasHost.append(renderer.domElement);renderer.domElement.setAttribute('aria-label','Interactive orbit view');renderer.domElement.setAttribute('role','img');
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(45,1,.01,1e8);camera.up.set(0,0,1);camera.position.set(4,-5,4);
 const orbitControls=new OrbitControls(camera,renderer.domElement);orbitControls.enableDamping=false;orbitControls.addEventListener('change',draw);
 const globe=new THREE.Mesh(new THREE.SphereGeometry(1,40,24),new THREE.MeshBasicMaterial({color:0x173553}));scene.add(globe);
 const wire=new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.SphereGeometry(1.002,24,12)),new THREE.LineBasicMaterial({color:0x3f6e91,transparent:true,opacity:.25}));scene.add(wire);
 const equator=new THREE.GridHelper(8,16,0x496881,0x172b41);equator.rotation.x=Math.PI/2;scene.add(equator);
 let group=new THREE.Group();scene.add(group);let el,playing=false,time=0,last=0,animation,disposed=false,visible=true;
 const epoch=new Date(),epochGmst=gmst(epoch);
 const handle=new THREE.Mesh(new THREE.SphereGeometry(.09,12,8),new THREE.MeshBasicMaterial({color:0xe5bc78}));scene.add(handle);
 function disposeGroup(g){g.traverse(o=>{o.geometry?.dispose();if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else o.material?.dispose();});scene.remove(g);}
 function line(points,color=0xe5bc78){const l=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points.map(p=>new THREE.Vector3(...p))),new THREE.LineBasicMaterial({color}));group.add(l);return l;}
 function draw(){if(!disposed)renderer.render(scene,camera);}
 function read(){for(const k of Object.keys(controls))params[k]=Number(controls[k].value);el=elements(params);}
 function update(){
  try{read();metrics.classList.remove('error');}catch(e){metrics.classList.add('error');metrics.textContent=e.message;return;}
  const burn=impulse(el,Number(radial.value),Number(prograde.value));
  metrics.textContent=`${params.body} · Period ${(el.period/60).toFixed(2)} min · e ${el.e.toFixed(5)} · Periapsis speed ${el.vp.toFixed(4)} km/s\nBurn Δv ${burn.deltaV.toFixed(3)} km/s → ${burn.apoapsis===null?'unbound trajectory':`periapsis ${burn.periapsis.toFixed(1)} km, apoapsis ${burn.apoapsis.toFixed(1)} km`}${burn.periapsis<0?' · Intersects central body':''}\nJ2 node drift ${(el.raanRate*86400*180/Math.PI).toFixed(4)} °/day · Epoch ${epoch.toISOString()}`;
  rebuild();ground();draw();
 }
 function rebuild(){
  disposeGroup(group);group=new THREE.Group();scene.add(group);const scale=el.radius;
  for(let plane=0;plane<Number(planes.value);plane++){
   const raan=plane*2*Math.PI/Number(planes.value)+(j2.checked?el.raanRate*time:0);
   line(Array.from({length:257},(_,k)=>position(el,2*Math.PI*k/256,raan).map(v=>v/scale)),plane?0x507d9f:0xe5bc78);
   for(let sat=0;sat<Number(count.value);sat++){
    const p=position(el,el.n*time+sat*2*Math.PI/Number(count.value),raan),v=new THREE.Vector3(...p).divideScalar(scale);
    const marker=new THREE.Mesh(new THREE.SphereGeometry(.04,8,6),new THREE.MeshBasicMaterial({color:0xa7e4e0}));marker.position.copy(v);group.add(marker);
    if(plane===0&&sat===0){
     const r=v.length(),elev=Number(elevation.value)*Math.PI/180,angle=Math.acos(Math.cos(elev)/r)-elev,n=v.clone().normalize();
     const a=new THREE.Vector3(0,0,1).cross(n).normalize();if(a.lengthSq()<.01)a.set(1,0,0);const b=n.clone().cross(a).normalize();const ring=[];
     for(let k=0;k<=64;k++){const theta=k*2*Math.PI/64;ring.push(n.clone().multiplyScalar(Math.cos(angle)*1.004).addScaledVector(a,Math.sin(angle)*Math.cos(theta)).addScaledVector(b,Math.sin(angle)*Math.sin(theta)).toArray());}
     line(ring,0x62c9bc);for(let k=0;k<64;k+=16)line([v.toArray(),ring[k]],0x245c65);
    }
   }
  }
  if(Number(radial.value)||Number(prograde.value))line(impulsePath(el,Number(radial.value),Number(prograde.value)).map(p=>p.map(v=>v/scale)),0x81ddc5);
  if(params.transfer)for(const radius of [el.rp,el.ra])line(Array.from({length:257},(_,k)=>{const t=k*2*Math.PI/256;return [radius/scale*Math.cos(t),radius/scale*Math.sin(t),0];}),0x507d9f);
  const base=new THREE.Vector3(el.rp/scale,0,0),tangent=.5+Number(prograde.value)*.25;handle.position.set(base.x+Number(radial.value)*.25,tangent*Math.cos(el.inclination),tangent*Math.sin(el.inclination));line([base.toArray(),handle.position.toArray()],0xf7dca9);
 }
 function ground(){if(params.body!=='Earth')return;const c=track.getContext('2d'),w=track.width,h=track.height;c.fillStyle='#0c1422';c.fillRect(0,0,w,h);c.strokeStyle='#26374c';c.lineWidth=1;
  for(let lon=-180;lon<=180;lon+=60){const x=(lon+180)/360*w;c.beginPath();c.moveTo(x,0);c.lineTo(x,h);c.stroke();c.fillStyle='#93a6bc';c.fillText(lon+'°',x+3,12);}for(let lat=-60;lat<=60;lat+=30){const y=(90-lat)/180*h;c.beginPath();c.moveTo(0,y);c.lineTo(w,y);c.stroke();c.fillText(lat+'°',3,y-3);}
  c.strokeStyle='#e5bc78';c.beginPath();let prev;
  for(let k=0;k<=500;k++){const t=el.period*2*k/500,pos=position(el,el.n*t,j2.checked?el.raanRate*t:0),p=groundPoint(pos,epochGmst+7.292115e-5*t),x=(p.lon+180)/360*w,y=(90-p.lat)/180*h;if(prev===undefined||Math.abs(x-prev)>w/2)c.moveTo(x,y);else c.lineTo(x,y);prev=x;}c.stroke();}
 function tick(t){if(disposed)return;if(playing&&visible&&!document.hidden){time+=Math.min((t-last)/1000,.1)*el.period/24;rebuild();draw();}last=t;if(playing)animation=requestAnimationFrame(tick);}
 play.onclick=()=>{playing=!playing;play.textContent=playing?'Pause orbit':'Play orbit';if(playing){last=performance.now();animation=requestAnimationFrame(tick);}else cancelAnimationFrame(animation);};
 reset.onclick=()=>{time=0;const range=Math.max(2.5,el.ra/el.radius*1.6);camera.position.set(range,-range,range*.7);orbitControls.target.set(0,0,0);orbitControls.update();update();};
 const raycaster=new THREE.Raycaster(),mouse=new THREE.Vector2(),plane=new THREE.Plane(new THREE.Vector3(0,0,1),0);let dragging=false;
 function ray(e){const r=renderer.domElement.getBoundingClientRect();mouse.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);raycaster.setFromCamera(mouse,camera);}
 renderer.domElement.addEventListener('pointerdown',e=>{ray(e);if(raycaster.intersectObject(handle).length){dragging=true;orbitControls.enabled=false;renderer.domElement.setPointerCapture(e.pointerId);}},true);
 renderer.domElement.addEventListener('pointermove',e=>{if(!dragging)return;ray(e);const p=new THREE.Vector3();plane.normal.set(0,-Math.sin(el.inclination),Math.cos(el.inclination));if(raycaster.ray.intersectPlane(plane,p)){radial.value=Math.max(-3,Math.min(3,(p.x-el.rp/el.radius)/.25));prograde.value=Math.max(-3,Math.min(3,(p.y*Math.cos(el.inclination)+p.z*Math.sin(el.inclination)-.5)/.25));radial.oninput();prograde.oninput();}});
 const release=()=>{dragging=false;orbitControls.enabled=true;};renderer.domElement.addEventListener('pointerup',release);renderer.domElement.addEventListener('pointercancel',release);
 const resize=new ResizeObserver(()=>{const w=canvasHost.clientWidth||600;renderer.setSize(w,320);camera.aspect=w/320;camera.updateProjectionMatrix();draw();});resize.observe(canvasHost);
 const observer=new IntersectionObserver(entries=>visible=entries[0].isIntersecting);observer.observe(wrap);
 update();reset.onclick();
 return ()=>{disposed=true;cancelAnimationFrame(animation);resize.disconnect();observer.disconnect();orbitControls.dispose();disposeGroup(group);scene.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});renderer.dispose();renderer.forceContextLoss();};
}
export function mountLagrange(host,system){
 const mu=system==='Earth–Moon'?.0121505856:3.00348e-6,points=lagrange(mu);
 const box=document.createElement('div');box.className='lagrange-card';const canvasHost=document.createElement('div');canvasHost.className='orbit-canvas';box.append(canvasHost);host.append(box);
 const note=document.createElement('p');note.className='science-note';note.textContent=system+' · Circular restricted three-body model in a rotating frame. Separation is normalized to 1; marker sizes are exaggerated. Drag to rotate and scroll to zoom. L1–L3 roots solved numerically. These are equilibrium locations, not a propagated mission orbit.';box.append(note);
 let renderer;try{renderer=new THREE.WebGLRenderer({antialias:true});}catch{canvasHost.textContent='3D graphics unavailable.';return ()=>{};}
 renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setClearColor(0x080f1d);canvasHost.append(renderer.domElement);
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(45,1,.01,100);camera.up.set(0,0,1);camera.position.set(.2,-1.6,3.6);
 const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,0,0);controls.update();const draw=()=>renderer.render(scene,camera);controls.addEventListener('change',draw);
 function add(x,y,r,color,label){const mesh=new THREE.Mesh(new THREE.SphereGeometry(r,20,12),new THREE.MeshBasicMaterial({color}));mesh.position.set(x,y,0);scene.add(mesh);const c=document.createElement('canvas');c.width=256;c.height=64;const ctx=c.getContext('2d');ctx.fillStyle='#e5ecf5';ctx.font='32px sans-serif';ctx.fillText(label,8,42);const texture=new THREE.CanvasTexture(c),sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true}));sprite.position.set(x+.15,y,.06);sprite.scale.set(.45,.1125,1);scene.add(sprite);}
 add(-mu,0,.045,0xe5bc78,'Primary');add(1-mu,0,.025,0x6ec4ef,'Secondary');points.forEach((p,k)=>add(...p,.016,0x81ddc5,'L'+(k+1)));
 const geometry=new THREE.BufferGeometry().setFromPoints(Array.from({length:257},(_,k)=>new THREE.Vector3(Math.cos(k*2*Math.PI/256)-mu,Math.sin(k*2*Math.PI/256),0)));scene.add(new THREE.Line(geometry,new THREE.LineBasicMaterial({color:0x28465c})));
 const table=document.createElement('p');table.className='science-metrics';table.textContent=points.map((p,i)=>'L'+(i+1)+': x '+p[0].toFixed(6)+', y '+p[1].toFixed(6)).join(' · ');box.append(table);
 const resize=new ResizeObserver(()=>{const width=canvasHost.clientWidth||600;renderer.setSize(width,320);camera.aspect=width/320;camera.updateProjectionMatrix();draw();});resize.observe(canvasHost);draw();
 return ()=>{resize.disconnect();controls.dispose();scene.traverse(o=>{o.geometry?.dispose();o.material?.map?.dispose();o.material?.dispose();});renderer.dispose();renderer.forceContextLoss();};
}
