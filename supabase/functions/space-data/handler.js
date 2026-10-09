import {authenticate,bodyJSON,cors,HttpError,json} from '../_shared/http.js';
import {queryProvider} from './providers.js';
export function makeHandler({createClient,env,fetcher=fetch}){
 const cache=new Map();let queue=Promise.resolve();
 return async req=>{let headers={};try{
  headers=cors(req,env.ALLOWED_ORIGINS||'');if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(req.method!=='POST')throw new HttpError(405,'Use POST.');
  const {client}=await authenticate(req,createClient,env);const body=await bodyJSON(req,20000);
  const quota=await client.rpc('consume_research_quota');if(quota.error)throw new HttpError(503,'Research limits could not be checked.');if(quota.data!==true)throw new HttpError(429,'Your hourly research limit has been reached. Please try again later.');
  const key=JSON.stringify(body),cached=cache.get(key);if(cached&&Date.now()-cached.time<300000)return json({...cached.data,cached:true},200,headers);
  // Serialize outbound work in this isolate, including JPL's no-parallel-request rule.
  const pending=queue.then(()=>queryProvider(body,fetcher));queue=pending.catch(()=>{});const data=await pending;
  if(cache.size>=50)cache.delete(cache.keys().next().value);cache.set(key,{time:Date.now(),data});return json(data,200,headers);
 }catch(e){return json({detail:e instanceof HttpError?e.message:'This scientific data source could not be reached. Please try again.'},e instanceof HttpError?e.status:503,headers);}};
}
