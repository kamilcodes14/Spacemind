/* Self-contained illustrated universe. Cached sprites keep animation inexpensive.
   No CDN, textures, location access, or third-party requests are required. */
(() => {
  const canvas=document.getElementById('universe'), ctx=canvas.getContext('2d');
  if(!ctx)return;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let prefs={scene:'universe',motion:true,speed:.3,brightness:.65,quality:'auto'};
  let width=innerWidth,height=innerHeight,clock=0,last=0,raf=null,frame=0;
  let seed=73;
  const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  const stars=Array.from({length:500},()=>({x:random(),y:random(),r:.3+random()*1.1,a:.15+random()*.65,p:random()*6.28}));
  function sprite(size,paint){const c=document.createElement('canvas');c.width=c.height=size;paint(c.getContext('2d'),size);return c;}
  const galaxy=sprite(700,(g,s)=>{
    g.translate(s/2,s/2);g.scale(1,.48);g.rotate(-.28);
    let glow=g.createRadialGradient(0,0,0,0,0,280);glow.addColorStop(0,'#eee0c570');glow.addColorStop(.15,'#9c9ec540');glow.addColorStop(.55,'#51628c14');glow.addColorStop(1,'#00000000');g.fillStyle=glow;g.fillRect(-s/2,-s,s,s*2);
    for(let i=0;i<5500;i++){const r=Math.pow(random(),.7)*300,a=r*.025+(i%3)*Math.PI*2/3+(random()-.5)*(.35+r*.004);const x=Math.cos(a)*r,y=Math.sin(a)*r;
      g.fillStyle=`rgba(${150+Math.floor(random()*100)},${160+Math.floor(random()*80)},230,${.08+random()*.4})`;g.beginPath();g.arc(x,y,random()*1.3+.2,0,Math.PI*2);g.fill();}
    glow=g.createRadialGradient(0,0,0,0,0,40);glow.addColorStop(0,'#fff3d2cc');glow.addColorStop(.2,'#eee0cb66');glow.addColorStop(1,'#ddd5ff00');g.fillStyle=glow;g.fillRect(-50,-50,100,100);
  });
  const nebula=sprite(700,(g,s)=>{
    for(let i=0;i<26;i++){const x=random()*s,y=random()*s,r=70+random()*170;const glow=g.createRadialGradient(x,y,0,x,y,r);const color=i%2?'83,102,165':'112,65,117';glow.addColorStop(0,`rgba(${color},.055)`);glow.addColorStop(.5,`rgba(${color},.025)`);glow.addColorStop(1,`rgba(${color},0)`);g.fillStyle=glow;g.fillRect(0,0,s,s);}
  });
  function planet(colors,ring=false,rock=false){return sprite(400,(g,s)=>{
    const cx=200,cy=200,r=ring?86:140;
    if(ring){g.save();g.translate(cx,cy);g.rotate(-.3);g.strokeStyle='#b7a18465';g.lineWidth=21;g.beginPath();g.ellipse(0,0,175,43,0,Math.PI,Math.PI*2);g.stroke();g.restore();}
    g.save();g.beginPath();g.arc(cx,cy,r,0,Math.PI*2);g.clip();const fill=g.createLinearGradient(cx-r,cy-r,cx+r,cy+r);fill.addColorStop(0,colors[0]);fill.addColorStop(1,colors[1]);g.fillStyle=fill;g.fillRect(cx-r,cy-r,r*2,r*2);
    if(rock){for(let i=0;i<95;i++){const x=cx-r+random()*r*2,y=cy-r+random()*r*2,cr=1+random()*12;g.fillStyle='#00000018';g.beginPath();g.ellipse(x,y,cr,cr*.8,0,0,Math.PI*2);g.fill();}}
    else{for(let i=0;i<38;i++){const y=cy-r+i*r*2/38;g.fillStyle=i%3===0?'#00000020':'#fff4d914';g.beginPath();g.moveTo(cx-r,y);g.bezierCurveTo(cx-r/2,y+12,cx+r/2,y-8,cx+r,y+3);g.lineTo(cx+r,y+8);g.bezierCurveTo(cx+r/2,y,cx-r/2,y+18,cx-r,y+6);g.fill();}}
    const shade=g.createRadialGradient(cx-r*.45,cy-r*.45,0,cx+r*.3,cy+r*.2,r*1.35);shade.addColorStop(0,'#ffffff05');shade.addColorStop(.45,'#00000010');shade.addColorStop(.85,'#02050beb');shade.addColorStop(1,'#02050b');g.fillStyle=shade;g.fillRect(cx-r,cy-r,r*2,r*2);g.restore();
    g.strokeStyle=colors[0]+'45';g.lineWidth=1;g.beginPath();g.arc(cx,cy,r,0,Math.PI*2);g.stroke();
    if(ring){g.save();g.translate(cx,cy);g.rotate(-.3);g.strokeStyle='#b7a18470';g.lineWidth=22;g.beginPath();g.ellipse(0,0,175,43,0,0,Math.PI);g.stroke();g.strokeStyle='#090d1670';g.lineWidth=3;g.beginPath();g.ellipse(0,0,177,43,0,0,Math.PI);g.stroke();g.restore();}
  });}
  const planets=[planet(['#bca076','#655b51'],true),planet(['#688797','#1a354b']),planet(['#ac7560','#51352d'],false,true),planet(['#9e9ca0','#414451'],false,true),planet(['#889f91','#233e46'],false,true)];
  const hole=sprite(300,(g,s)=>{g.translate(150,150);g.rotate(-.22);g.scale(1,.4);const glow=g.createRadialGradient(0,0,25,0,0,130);glow.addColorStop(0,'#00000000');glow.addColorStop(.16,'#ddae6655');glow.addColorStop(.28,'#d9a665aa');glow.addColorStop(.5,'#c28a3f33');glow.addColorStop(1,'#00000000');g.fillStyle=glow;g.fillRect(-150,-150,300,300);g.setTransform(1,0,0,1,0,0);g.fillStyle='#03060b';g.beginPath();g.arc(150,150,24,0,Math.PI*2);g.fill();g.strokeStyle='#e1b77580';g.lineWidth=2;g.stroke();});
  function drawImage(img,x,y,size,alpha=1,rotation=0){ctx.save();ctx.globalAlpha=alpha;ctx.translate(x,y);ctx.rotate(rotation);ctx.drawImage(img,-size/2,-size/2,size,size);ctx.restore();}
  function draw(){
    ctx.clearRect(0,0,width,height);ctx.fillStyle='#080b12';ctx.fillRect(0,0,width,height);
    const t=clock, scene=prefs.scene,b=prefs.brightness;
    ctx.save();ctx.globalAlpha=b;
    drawImage(nebula,width*.76,height*.38,Math.max(width,height)*1.2,scene==='nebula'?1:.38,Math.sin(t*.004)*.06);
    const count=prefs.quality==='low'||(prefs.quality==='auto'&&width<700)?180:500;
    for(let i=0;i<count;i++){const s=stars[i],x=(s.x*width+t*(.12+s.r*.1))%width,y=s.y*height+Math.sin(t*.012+s.p)*2;ctx.globalAlpha=b*s.a*(.85+.15*Math.sin(t*.3+s.p));ctx.fillStyle=i%4?'#cbd3e3':'#e7c695';ctx.beginPath();ctx.arc(x,y,s.r,0,Math.PI*2);ctx.fill();}
    ctx.globalAlpha=b;
    if(scene!=='solar'){
      drawImage(galaxy,width*.88,height*.19,Math.min(width*.62,660),b*(scene==='galaxy'?.85:.58),-.34+t*.0004);
      if(scene==='galaxy'||scene==='universe')drawImage(galaxy,width*.3,height*.7,240,b*.25,.8-t*.0003);
    }
    if(scene==='universe'||scene==='solar'){
      const drift=Math.sin(t*.015);
      drawImage(planets[0],width*.91+drift*8,height*.7,Math.min(width*.3,360),b*.85,.08);
      drawImage(planets[1],width*.43,height*.12+drift*5,86,b*.55,t*.0007);
      drawImage(planets[2],width*.15,height*.6-drift*9,100,b*.6);
      drawImage(planets[3],width*.88,height*.46,37,b*.7);
      if(scene==='solar'){drawImage(planets[4],width*.61,height*.28,110,b*.6);drawImage(planets[2],width*.7,height*.77,65,b*.5);}
      if(scene==='universe')drawImage(hole,width*.15,height*.19,180,b*.45);
    }
    if(scene==='nebula'){drawImage(nebula,width*.25,height*.65,height,b*.9,.9);drawImage(planets[3],width*.89,height*.77,100,b*.6);}
    // An occasional distant comet, rendered only during active motion.
    const phase=t%65;if(phase<5&&t>5&&prefs.motion&&!reduced.matches){const x=width*(.7+phase*.08),y=height*(.08+phase*.025);const grad=ctx.createLinearGradient(x-70,y-20,x,y);grad.addColorStop(0,'#cad6ed00');grad.addColorStop(1,'#cad6ed80');ctx.strokeStyle=grad;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x-70,y-20);ctx.lineTo(x,y);ctx.stroke();}
    ctx.restore();
  }
  function tick(now){raf=null;if(document.hidden||!prefs.motion||reduced.matches){last=0;draw();return;}if(!last)last=now;
    const elapsed=Math.min((now-last)/1000,.1);last=now;clock+=elapsed*(.2+prefs.speed*1.8);frame+=elapsed;
    if(frame>=1/30){frame=0;draw();}raf=requestAnimationFrame(tick);
  }
  function restart(){if(raf!==null)cancelAnimationFrame(raf);raf=null;last=0;draw();if(!document.hidden&&prefs.motion&&!reduced.matches)raf=requestAnimationFrame(tick);}
  function resize(){width=innerWidth;height=innerHeight;const dpr=prefs.quality==='low'?1:Math.min(devicePixelRatio||1,prefs.quality==='high'?2:1.5);canvas.width=width*dpr;canvas.height=height*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);restart();}
  window.SpaceUniverse={configure(next){prefs={...prefs,...next};resize();}};
  addEventListener('resize',resize);document.addEventListener('visibilitychange',restart);reduced.addEventListener('change',restart);resize();
})();
