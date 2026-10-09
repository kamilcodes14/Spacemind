import {createClient} from 'npm:@supabase/supabase-js@2.117.2';
import {bodyJSON,HttpError,json,safeURL} from '../_shared/http.js';
declare const Supabase: {ai:{Session:new (model:string)=>{run:(text:string,options:object)=>Promise<number[]>}}};
let model:InstanceType<typeof Supabase.ai.Session>;
Deno.serve(async req=>{
 try{
  if(req.method!=='POST')throw new HttpError(405,'Method not allowed.');
  const secret=Deno.env.get('PAPER_IMPORT_TOKEN');
  if(!secret||secret.length<32||req.headers.get('authorization')!==`Bearer ${secret}`)throw new HttpError(401,'Operator authorization required.');
  const body=await bodyJSON(req,12000);
  for(const key of ['id','doc_id','title','origin','content'])if(typeof body[key]!=='string'||!body[key].trim())throw new HttpError(422,'Missing paper fields.');
  if(body.id.length>200||body.doc_id.length>200||body.title.length>500||body.content.length>1800)throw new HttpError(422,'Paper chunk is too large.');
  const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
  // Retrying an import does not regenerate an existing identical embedding.
  const existing=await admin.from('paper_chunks').select('id,content').eq('id',body.id).maybeSingle();
  if(existing.error)throw new HttpError(503,'Apply the paper-library migration before importing.');
  const metadata={authors:Array.isArray(body.authors)?body.authors.filter((a:unknown)=>typeof a==='string').slice(0,100):[],year:Number.isInteger(body.year)&&body.year>=1600&&body.year<=2200?body.year:null,arxiv_id:typeof body.arxiv_id==='string'?body.arxiv_id.slice(0,100):null,categories:Array.isArray(body.categories)?body.categories.filter((c:unknown)=>typeof c==='string').slice(0,20):[]};
  if(existing.data?.content===body.content){
    const updated=await admin.from('paper_chunks').update({title:body.title,...metadata}).eq('id',body.id);
    if(updated.error)throw new HttpError(503,'Paper metadata could not be saved.');
    return json({id:body.id,skipped:true});
  }
  model??=new Supabase.ai.Session('gte-small');
  const embedding=await model.run(body.content,{mean_pool:true,normalize:true});
  const saved=await admin.from('paper_chunks').upsert({id:body.id,doc_id:body.doc_id,title:body.title,origin:body.origin,url:safeURL(body.url),content:body.content,embedding,embedding_model:'gte-small',...metadata});
  if(saved.error)throw new HttpError(503,'Paper chunk could not be saved.');
  return json({id:body.id,skipped:false});
 }catch(error){return json({detail:error instanceof HttpError?error.message:'Paper import failed.'},error instanceof HttpError?error.status:503);}
});
