// This schema is shared with the browser. Tool data is never executable JavaScript.
const number=(p,k,min,max)=>{const v=p[k];if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw Error(`Invalid ${k}.`);return v;};
const string=(p,k,max=160)=>{if(typeof p[k]!=='string'||!p[k].trim()||p[k].length>max)throw Error(`Invalid ${k}.`);return p[k].trim();};
export const TOOL_ORIGIN='spacemind-tool-v1';
export function validateTool(value){
 if(!value||typeof value!=='object'||!value.params||typeof value.params!=='object')throw Error('Invalid science tool.');
 const {kind,params:p}=value;let params={};
 if(['orbit','hohmann'].includes(kind)){
  if(!['Earth','Moon','Mars','Sun'].includes(p.body))throw Error('Unknown central body.');params.body=p.body;
  if(kind==='orbit'){params.periapsis=number(p,'periapsis',1,1e10);params.apoapsis=number(p,'apoapsis',params.periapsis,1e10);params.inclination=number(p,'inclination',0,180);}
  else{params.start=number(p,'start',1,1e10);params.end=number(p,'end',1,1e10);}
 }else if(kind==='rocket'){params={isp:number(p,'isp',1,100000),wet:number(p,'wet',1,1e12),dry:number(p,'dry',1,1e12)};if(params.dry>params.wet)throw Error('Dry mass exceeds wet mass.');}
 else if(kind==='horizons'||kind==='spice'){
  for(const key of ['target','observer']){const s=string(p,key,16);if(!/^-?\d{1,9}$/.test(s))throw Error('Use a numeric NAIF ID.');params[key]=s;}
  params.epoch=string(p,'epoch',30);if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(params.epoch)||!Number.isFinite(Date.parse(params.epoch)))throw Error('Use an ISO UTC epoch.');
 }else if(kind==='mast'){params={ra:number(p,'ra',0,360),dec:number(p,'dec',-90,90),radius:number(p,'radius',.001,1)};}
 else if(kind==='mast-products'){params.obsid=string(p,'obsid',30);if(!/^\d+$/.test(params.obsid))throw Error('Invalid observation ID.');}
 else if(kind==='pds'){params.query=string(p,'query',120);}
 else if(kind==='weather'||kind==='launches'){params={};}
 else if(kind==='lagrange'){if(!['Sun–Earth','Earth–Moon'].includes(p.system))throw Error('Unknown system.');params.system=p.system;}
 else if(kind==='python'){params.code=string(p,'code',16000);}
 else throw Error('Unsupported science tool.');
 return {kind,params};
}
export const scienceInstructions=`For requests to calculate, simulate, visualize, query ephemerides, browse mission data or inspect space weather/launch schedules, use mode="science" and tool={kind,params} with exactly one supported schema below. Include answer: a short introduction that STATES assumptions and units; never claim a calculation ran or invent its output. Missing inputs: use mode="chat" and ask one specific clarification. Never substitute an orbit illustration for a requested numerical calculation.
Supported tools:
orbit: {body:"Earth"|"Moon"|"Mars"|"Sun",periapsis:number,apoapsis:number,inclination:number}. Altitudes in km above body surface, inclination in degrees. For a generic visualization only, you may explicitly propose a 400 km circular Earth orbit at 51.6 degrees as an editable example.
hohmann: {body,start:number,end:number}. Circular orbit ALTITUDES in km above the named central body's surface, coplanar impulsive transfer; requires both altitudes. For interplanetary orbit radii subtract Sun radius 695700 km. Never imply this includes planet escape/capture.
rocket: {isp:number,wet:number,dry:number}. Isp seconds, masses kg. Requires all three.
spice or horizons: {target:"numeric NAIF ID",observer:"numeric NAIF ID",epoch:"YYYY-MM-DDTHH:mm:ssZ"}. SPICE requires user-uploaded kernels. Horizons fetches state vectors in equatorial J2000, geometric, km/s and km. Planet centers: Earth 399, Moon 301, Mars 499, Sun 10. Must clarify target, observer and epoch if not clear. Use date context for "now".
mast: {ra:number,dec:number,radius:number}. ICRS degrees; cone radius .001–1 deg. Requires sky coordinates; do not invent target coordinates.
pds: {query:"short dataset or target keywords"}.
weather: {}. NOAA solar flares, Kp and alerts plus NASA DONKI CME records; NOT a prediction of personal risk.
launches: {}. Upcoming launch schedules; dates may change.
lagrange: {system:"Sun–Earth"|"Earth–Moon"}. Circular restricted three-body illustration.
python: {code:"Python script"}. Use for custom calculations unsupported above, only if requested. Available imports numpy, scipy, astropy, matplotlib, spiceypy; skyfield may need optional installation. No poliastro. Scripts run only after the user reviews and clicks Run. Avoid networking, shell/subprocess, package installs or filesystem writes outside /work. Include units, assumptions and numerical checks. No pretense that code has already run.`;
export function toolResult(route){const tool=validateTool(route.tool);return {answer:typeof route.answer==='string'?route.answer.slice(0,2000):'Open the research tool below.',citations:[{origin:TOOL_ORIGIN,source_file:'Research tool',snippet:JSON.stringify(tool),url:null}],follow_up_questions:[],confident:true,used_web:false,warnings:[]};}
