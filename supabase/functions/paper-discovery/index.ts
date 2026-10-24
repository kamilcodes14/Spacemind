import {createClient} from 'npm:@supabase/supabase-js@2.117.2';
import {authenticate,bodyJSON,cors,HttpError,json} from '../_shared/http.js';
import {cachedProvider,serviceClient} from '../_shared/provider-cache.js';
import {discoverWithFallback} from './providers.js';
const env=Deno.env.toObject();const admin=serviceClient(createClient,env);
Deno.serve(async req=>{let headers={};try{
 headers=cors(req,env.ALLOWED_ORIGINS||'');if(req.method==='OPTIONS')return new Response(null,{status:204,headers});if(req.method!=='POST')throw new HttpError(405,'Use POST.');
 const {client}=await authenticate(req,createClient,env);const body=await bodyJSON(req,2000);
 const quota=await client.rpc('consume_research_quota');if(quota.error)throw new HttpError(503,'Research limits could not be checked.');if(!quota.data)throw new HttpError(429,'Your hourly research limit has been reached.');
 return json(await cachedProvider(admin,'discovery:v3:'+JSON.stringify(body),()=>discoverWithFallback(body,env,client)),200,headers);
}catch(e){return json({detail:e instanceof HttpError?e.message:'Paper discovery is temporarily unavailable.'},e instanceof HttpError?e.status:503,headers);}});
