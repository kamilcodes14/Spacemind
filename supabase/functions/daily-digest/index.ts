import {createClient} from 'npm:@supabase/supabase-js@2.117.2';
import {digestRows} from './ingest.js';
import {json} from '../_shared/http.js';
const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
Deno.serve(async req=>{
 if(req.method!=='POST')return json({detail:'Use POST.'},405);
 const token=req.headers.get('x-job-token')||'';if(token.length<60||token.length>200)return json({detail:'Job authorization required.'},401);
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))).map(x=>x.toString(16).padStart(2,'0')).join('');
 const key=await admin.from('scheduled_job_keys').select('job').eq('job','daily-digest').eq('token_hash',hash).maybeSingle();if(key.error||!key.data)return json({detail:'Job authorization required.'},401);
 const lease=await admin.rpc('claim_digest_job',{p_hash:hash});if(lease.error)return json({detail:'Job unavailable.'},503);if(!lease.data)return json({skipped:true});
 try{
  const rows=await digestRows();
  // Lexical evidence and alerts are available immediately. An existing full-text
  // or embedded chunk is never overwritten by this daily abstract feed.
  const saved=await admin.from('paper_chunks').upsert(rows,{onConflict:'id',ignoreDuplicates:true});if(saved.error)throw Error('Import failed');
  const alerts=await admin.rpc('refresh_paper_alerts');if(alerts.error)throw Error('Alerts failed');
  await admin.from('scheduled_job_keys').update({last_success:new Date().toISOString(),leased_until:null}).eq('job','daily-digest');
  return json({papers:rows.length,new_alerts:alerts.data,source:'arXiv abstracts',coverage:'First 100 newest papers across the selected categories; not an exhaustive feed.'});
 }catch{
  await admin.from('scheduled_job_keys').update({leased_until:null}).eq('job','daily-digest');
  return json({detail:'Daily digest could not complete. Retry the job.'},503);
 }
});
