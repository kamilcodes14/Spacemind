import {validateTool} from '../_shared/science-tools.js';
import {HttpError} from '../_shared/http.js';
const endpoints={horizons:'https://ssd.jpl.nasa.gov/api/horizons.api',mast:'https://mast.stsci.edu/api/v0/invoke',pds:'https://pds.nasa.gov/api/search/1/products',weather:'https://services.swpc.noaa.gov',launches:'https://ll.thespacedevs.com/2.3.0/launches/upcoming/'};
// Bounded responses, request timeouts, and fixed upstream hosts. Never proxy user URLs.
async function get(url,fetcher,options={}){
 const response=await fetcher(url,{...options,signal:AbortSignal.timeout(25000),headers:{Accept:'application/json',...options.headers}});
 if(!response.ok)throw new HttpError(response.status===429?429:503,'This data source is temporarily unavailable. Please try again later.');
 const reader=response.body.getReader();let size=0,text='';const decoder=new TextDecoder();
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>3_000_000){await reader.cancel();throw new HttpError(503,'The data source returned too much data. Narrow your query.');}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();
 try{return JSON.parse(text);}catch{throw new HttpError(503,'The data source returned an unreadable response.');}
}
export function parseHorizons(data){
 if(data.error||typeof data.result!=='string')throw new HttpError(422,'No ephemeris matched. Check target, observer and time coverage.');
 const segment=data.result.split('$$SOE')[1]?.split('$$EOE')[0];if(!segment)throw new HttpError(422,'No unambiguous ephemeris matched. Use a numeric NAIF target ID.');
 const rows=segment.trim().split('\n').filter(Boolean).map(line=>{const c=line.split(',').map(v=>v.trim());return {jd_ut:Number(c[0]),calendar_ut:c[1],x_km:Number(c[2]),y_km:Number(c[3]),z_km:Number(c[4]),vx_km_s:Number(c[5]),vy_km_s:Number(c[6]),vz_km_s:Number(c[7])};});
 if(!rows.length||rows.some(r=>Object.entries(r).some(([k,v])=>k!=='calendar_ut'&&!Number.isFinite(v))))throw new HttpError(503,'The ephemeris format changed. Please try again later.');
 return {rows,raw:data.result,signature:data.signature};
}
export async function queryProvider(input,fetcher=fetch){
 let tool;try{tool=validateTool(input);}catch(e){throw new HttpError(422,e.message);}const {kind,params:p}=tool;
 const retrieved_at=new Date().toISOString();
 if(kind==='horizons'){
  const u=new URL(endpoints.horizons);u.search=new URLSearchParams({format:'json',COMMAND:`'${p.target}'`,CENTER:`'500@${p.observer}'`,MAKE_EPHEM:"'YES'",EPHEM_TYPE:"'VECTORS'",TLIST:`'${p.epoch.replace('T',' ').replace('Z','')}'`,TLIST_TYPE:"'CAL'",TIME_TYPE:"'UT'",OUT_UNITS:"'KM-S'",REF_PLANE:"'FRAME'",REF_SYSTEM:"'ICRF'",VEC_CORR:"'NONE'",VEC_TABLE:"'2'",CSV_FORMAT:"'YES'",OBJ_DATA:"'YES'"}).toString();
  return {kind,provider:'NASA/JPL Horizons',source:u.href,retrieved_at,request:p,...parseHorizons(await get(u.href,fetcher)),note:'Geometric state in equatorial ICRF/J2000 axes. Input and output epochs use UT (UTC from 1962 onward; UT1 earlier). Ephemerides are modeled estimates, not live telemetry.'};
 }
 if(kind==='mast'||kind==='mast-products'){
  const request=kind==='mast'?{service:'Mast.Caom.Cone',params:p,format:'json',pagesize:20,page:1}:{service:'Mast.Caom.Products',params:{obsid:p.obsid},format:'json',pagesize:30,page:1};
  const data=await get(endpoints.mast,fetcher,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({request:JSON.stringify(request)}).toString()});
  if(data.status!=='COMPLETE')throw new HttpError(503,data.status==='EXECUTING'?'The archive is still processing this query. Please retry shortly.':'The archive could not complete this query.');
  const rows=(data.data||[]).map(r=>kind==='mast'?{obsid:String(r.obsid),collection:r.obs_collection,target:r.target_name,instrument:r.instrument_name,ra_deg:r.s_ra,dec_deg:r.s_dec,exposure_s:r.t_exptime,calibration_level:r.calib_level,rights:r.dataRights}:{filename:r.productFilename,description:r.description,type:r.productType,subgroup:r.productSubGroupDescription,calibration_level:r.calib_level,size_bytes:r.size,url:typeof r.dataURI==='string'?'https://mast.stsci.edu/api/v0.1/Download/file?uri='+encodeURIComponent(r.dataURI):null});
  return {kind,provider:'STScI MAST',source:'https://mast.stsci.edu/portal/Mashup/Clients/Mast/Portal.html',retrieved_at,request:p,rows,note:'First page of archive metadata. Calibration levels and access rights come from MAST. Open an observation to list downloadable raw/processed products; restricted data may require archive sign-in.'};
 }
 if(kind==='pds'){
  const u=new URL(endpoints.pds);u.search=new URLSearchParams({keywords:p.query,limit:'20'}).toString();const data=await get(u.href,fetcher);
  const rows=(data.data||[]).map(r=>{const properties=r.properties||{},first=k=>Array.isArray(properties[k])?properties[k][0]:properties[k];return {id:r.id||first('lidvid'),title:first('pds:Identification_Area.pds:title'),processing_level:first('pds:Primary_Result_Summary.pds:processing_level'),url:r.id?endpoints.pds+'/'+encodeURIComponent(r.id):null,files:properties['ops:Data_File_Info.ops:file_ref']||[],labels:properties['ops:Label_File_Info.ops:file_ref']||[]};});
  return {kind,provider:'NASA Planetary Data System',source:u.href,retrieved_at,request:p,rows,note:'First 20 matching product records. Archive coverage is incomplete; no results does not prove no observations exist. File links come from archive metadata.'};
 }
 if(kind==='weather'){
  const feeds={flares:'/json/goes/primary/xray-flares-7-day.json',kp:'/products/noaa-planetary-k-index.json',alerts:'/products/alerts.json'};const rows={},warnings=[];
  // Independent NOAA datasets; one missing feed must not hide the others.
  for(const [name,path] of Object.entries(feeds)){try{const d=await get(endpoints.weather+path,fetcher);rows[name]=name==='kp'?[d[0],...d.slice(-12)]:d.slice(name==='alerts'?0:-20,name==='alerts'?10:undefined);}catch{warnings.push(`${name} data is unavailable.`);}}
  const start=new Date(Date.now()-7*86400000).toISOString().slice(0,10),end=new Date().toISOString().slice(0,10),cmeSource='https://ccmc.gsfc.nasa.gov/DONKI-API/get/CME?'+new URLSearchParams({startDate:start,endDate:end});
  try{rows.cmes=await get(cmeSource,fetcher);}catch{warnings.push('NASA CME catalog is unavailable.');}
  if(!Object.keys(rows).length)throw new HttpError(503,'Space-weather data is temporarily unavailable.');
  return {kind,provider:'NOAA SWPC + NASA CCMC DONKI',source:endpoints.weather,sources:{noaa:endpoints.weather,cmes:cmeSource},retrieved_at,rows,warnings,note:'Observation/issue timestamps are in each record. Retrieval time does not guarantee fresh observations. CME records cover the past seven days and contain analyst measurements; updates may lag events. An empty catalog is not an all-clear.'};
 }
 if(kind==='launches'){
  const u=endpoints.launches+'?limit=10&mode=list&hide_recent_previous=true';const data=await get(u,fetcher);
  return {kind,provider:'The Space Devs — Launch Library 2',source:u,retrieved_at,rows:(data.results||[]).map(r=>({name:r.name,net:r.net,status:r.status?.name,provider:r.launch_service_provider?.name,pad:r.pad?.name,location:r.pad?.location?.name,url:r.url})),note:'NET means no earlier than. Launch times and status can change; this is a community-maintained schedule, not a NASA/ESA operations feed.'};
 }
 throw new HttpError(422,'Choose an archive, ephemeris, weather or launch tool.');
}
