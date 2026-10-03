import {createClient} from 'npm:@supabase/supabase-js@2.117.2';
import {authenticate,bodyJSON,cors,HttpError,json} from '../_shared/http.js';
Deno.serve(async req=>{
 let headers={};try{
  const env=Deno.env.toObject();headers=cors(req,env.ALLOWED_ORIGINS||'');
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(req.method!=='POST')throw new HttpError(405,'Method not allowed.');
  const {client,user}=await authenticate(req,createClient,env);
  const body=await bodyJSON(req,2000);
  if(typeof body.password!=='string'||body.password.length>128)throw new HttpError(422,'Enter your password.');
  const quota=await client.rpc('consume_research_quota');
  if(quota.error||quota.data!==true)throw new HttpError(429,'Too many requests. Please try again later.');
  const verifier=createClient(env.SUPABASE_URL,env.SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const verified=await verifier.auth.signInWithPassword({email:user.email!,password:body.password});
  if(verified.error||verified.data.user?.id!==user.id)throw new HttpError(400,'Password is incorrect.');
  // Only this server-side function receives the service-role key.
  const admin=createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const revoked=await admin.auth.admin.signOut(req.headers.get('authorization')!.slice(7),'global');
  if(revoked.error)throw new HttpError(503,'Sessions could not be revoked. Please retry.');
  const deleted=await admin.auth.admin.deleteUser(user.id);
  if(deleted.error)throw new HttpError(503,'Account deletion could not complete. Please retry.');
  return json({ok:true},200,headers);
 }catch(error){return json({detail:error instanceof HttpError?error.message:'Account deletion failed.'},error instanceof HttpError?error.status:503,headers);}
});
