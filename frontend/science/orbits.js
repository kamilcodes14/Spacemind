// km, seconds, radians. Fixed gravitational parameters; educational two-body model.
export const BODIES={Earth:{mu:398600.4418,radius:6378.137,j2:1.08262668e-3},Moon:{mu:4902.800066,radius:1737.4,j2:0},Mars:{mu:42828.375214,radius:3396.19,j2:0},Sun:{mu:132712440041.9394,radius:695700,j2:0}};
export const AU=149597870.7;
export function finite(v,min,max,label){if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw new Error(`${label} must be between ${min} and ${max}.`);return v;}
export function elements(p){
 const body=BODIES[p.body];if(!body)throw new Error('Choose a supported central body.');
 const rp=body.radius+finite(p.periapsis,1,1e10,'Periapsis altitude (km)'),ra=body.radius+finite(p.apoapsis,1,1e10,'Apoapsis altitude (km)');
 if(ra<rp)throw new Error('Apoapsis must be at least periapsis.');
 const inclination=finite(p.inclination,0,180,'Inclination')*Math.PI/180,a=(rp+ra)/2,e=(ra-rp)/(ra+rp),n=Math.sqrt(body.mu/a**3),period=2*Math.PI/n;
 const raanRate=-1.5*body.j2*n*(body.radius/(a*(1-e*e)))**2*Math.cos(inclination);
 return {...body,rp,ra,a,e,inclination,n,period,raanRate,vp:Math.sqrt(body.mu*(2/rp-1/a)),va:Math.sqrt(body.mu*(2/ra-1/a))};
}
export function position(el,meanAnomaly,raan=0){
 const M=((meanAnomaly%(2*Math.PI))+2*Math.PI)%(2*Math.PI);let E=el.e>.8?Math.PI:M;for(let j=0;j<80;j++){const d=(E-el.e*Math.sin(E)-M)/(1-el.e*Math.cos(E));E-=d;if(Math.abs(d)<1e-12)break;}
 const x=el.a*(Math.cos(E)-el.e),y=el.a*Math.sqrt(1-el.e**2)*Math.sin(E),c=Math.cos(raan),s=Math.sin(raan),ci=Math.cos(el.inclination);
 return [c*x-s*y*ci,s*x+c*y*ci,y*Math.sin(el.inclination)];
}
export function hohmann(mu,r1,r2){
 finite(mu,1,1e15,'Gravitational parameter');finite(r1,1,1e12,'Initial radius');finite(r2,1,1e12,'Final radius');
 const a=(r1+r2)/2,dv1=Math.sqrt(mu*(2/r1-1/a))-Math.sqrt(mu/r1),dv2=Math.sqrt(mu/r2)-Math.sqrt(mu*(2/r2-1/a));
 return {dv1,dv2,total:Math.abs(dv1)+Math.abs(dv2),seconds:Math.PI*Math.sqrt(a**3/mu)};
}
export function impulse(el,radial,prograde){
 finite(radial,-50,50,'Radial impulse');finite(prograde,-50,50,'Prograde impulse');
 const vt=el.vp+prograde,energy=(vt*vt+radial*radial)/2-el.mu/el.rp,h=el.rp*vt;
 const e=Math.sqrt(Math.max(0,1+2*energy*h*h/el.mu**2)),rp=h*h/el.mu/(1+e);
 return {deltaV:Math.hypot(radial,prograde),eccentricity:e,periapsis:rp-el.radius,apoapsis:energy<0?-el.mu/energy-rp-el.radius:null};
}
export function gmst(date){const jd=date.getTime()/86400000+2440587.5,d=jd-2451545;return ((280.46061837+360.98564736629*d)%360)*Math.PI/180;}
export function groundPoint(pos,theta){return {lon:((Math.atan2(pos[1],pos[0])-theta)*180/Math.PI%360+540)%360-180,lat:Math.atan2(pos[2],Math.hypot(pos[0],pos[1]))*180/Math.PI};}
export function lagrange(mu){
 finite(mu,1e-10,.5,'Mass ratio');const f=x=>x-(1-mu)*(x+mu)/Math.abs(x+mu)**3-mu*(x-1+mu)/Math.abs(x-1+mu)**3;
 const root=(a,b)=>{for(let k=0;k<100;k++){const m=(a+b)/2;if(f(a)*f(m)<=0)b=m;else a=m;}return (a+b)/2;};
 return [[root(-mu+1e-8,1-mu-1e-8),0],[root(1-mu+1e-8,3),0],[root(-3,-mu-1e-8),0],[.5-mu,Math.sqrt(3)/2],[.5-mu,-Math.sqrt(3)/2]];
}

// Osculating post-impulse conic, in the original orbital plane. No propagation through impact.
export function impulsePath(el,radial,prograde,samples=256){
 const vt=el.vp+prograde,h=el.rp*vt,p=h*h/el.mu;
 if(p<1e-10)return []; // Degenerate radial trajectory.
 const ex=el.rp*vt*vt/el.mu-1,ey=-el.rp*radial*vt/el.mu,e=Math.hypot(ex,ey),arg=Math.atan2(ey,ex);
 const limit=e<1?Math.PI:Math.acos(-1/e)*.98,points=[];
 for(let k=0;k<=samples;k++){const f=-limit+2*limit*k/samples,r=p/(1+e*Math.cos(f)),theta=f+arg;
  points.push([r*Math.cos(theta),r*Math.sin(theta)*Math.cos(el.inclination),r*Math.sin(theta)*Math.sin(el.inclination)]);
 }return points;
}
