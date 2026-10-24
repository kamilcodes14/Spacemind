// Capture through normal auth, quota, retrieval and persistence. Never self-grade.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createClient} from '@supabase/supabase-js';
import {RUBRIC_VERSION,digest,reviewTemplate,summarize,representativeSample} from './eval-review.mjs';
const required=['SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','EVAL_EMAIL','EVAL_PASSWORD'];
if(required.some(k=>!process.env[k]))throw Error('Deployed evaluation requires Supabase URL/public key and a dedicated confirmed test account in EVAL_EMAIL/EVAL_PASSWORD. No evaluation ran.');
const base=process.env.SUPABASE_URL.replace(/\/$/,'');
if(base!=='https://aqblctjucyxqjmylojgc.supabase.co')throw Error('Unexpected evaluation project.');
const client=createClient(base,process.env.SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const auth=await client.auth.signInWithPassword({email:process.env.EVAL_EMAIL,password:process.env.EVAL_PASSWORD});
if(auth.error)throw Error('Test account sign-in failed. Verify protected CI credentials.');
const cases=JSON.parse(await readFile('evals/space-questions.json','utf8'));
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const revision=process.env.GITHUB_SHA||execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const report={schema_version:2,created_at:new Date().toISOString(),target:base,revision,rubric_version:RUBRIC_VERSION,dataset_sha256:digest(cases),backend_revision:process.env.EVAL_BACKEND_REVISION||'unrecorded',representative_sample:representativeSample(cases),status:'capturing',results:[]};
await mkdir('evals/reports',{recursive:true});
const checkpoint=async()=>{
 report.summary=summarize(report);
 for(const file of ['evals/latest-report.json',`evals/reports/${stamp}.json`])await writeFile(file,JSON.stringify(report,null,2));
};
try{
 for(const item of cases){
  const chat=await client.from('chats').insert({user_id:auth.data.user.id,title:`Evaluation ${stamp} ${item.id}`}).select('id').single();
  if(chat.error)throw Error('Authenticated chat insert failed; stop and check RLS.');
  const started=Date.now();
  try{
   let response,requestStarted;
   const attempts=[];
   for(let attempt=0;attempt<2;attempt++){
    const refreshed=await client.auth.refreshSession();
    if(refreshed.error)throw Error('Test session refresh failed.');
    requestStarted=Date.now();response=await fetch(base+'/functions/v1/research',{method:'POST',headers:{'Content-Type':'application/json',apikey:process.env.SUPABASE_PUBLISHABLE_KEY,Authorization:'Bearer '+refreshed.data.session.access_token},body:JSON.stringify({chat_id:chat.data.id,question:item.question,use_web:item.mode==='auto'?null:item.mode==='web',depth:'technical'}),signal:AbortSignal.timeout(180000)});
    attempts.push({status:response.status,headers_ms:Date.now()-requestStarted});
    if(response.status!==429||attempt===1)break;
    const until=(Math.floor(Date.now()/3600000)+1)*3600000+2000;
    report.quota_wait_until=new Date(until).toISOString();await checkpoint();
    console.log('Quota reached; checkpoint saved. Waiting without bypassing limits.');
    while(Date.now()<until)await new Promise(r=>setTimeout(r,Math.min(30000,until-Date.now())));
    delete report.quota_wait_until;
   }
   if(!response.ok)throw Error(`Research HTTP ${response.status}`);
   const result=await response.json();
   const latency=Date.now()-requestStarted;
   const saved=await client.from('messages').select('id,answer').eq('chat_id',chat.data.id).eq('id',result.message_id).single();
   if(saved.error||saved.data.answer!==result.answer)throw Error('Authenticated saved-answer readback mismatch.');
   const row={id:item.id,question:item.question,category:item.category,mode:item.mode,latency_ms:latency,total_elapsed_ms:Date.now()-started,attempts,source_count:result.citations?.length||0,answer:result.answer||'',citations:result.citations||[],warnings:result.warnings||[],application_verification:{claims:result.claims,complete:result.verification_complete,confident:result.confident},review_valid:false};
   row.review=reviewTemplate(row,item);report.results.push(row);
  }catch(error){
   // Never serialize arbitrary provider/auth exception messages or response bodies.
   const safe=/^(Research HTTP \d{3}|Test session refresh failed\.|Authenticated saved-answer readback mismatch\.)$/;
   report.results.push({id:item.id,category:item.category,mode:item.mode,total_elapsed_ms:Date.now()-started,error:safe.test(error.message)?error.message:'Evaluation request failed or timed out.'});
  }
  await checkpoint();console.log(`Captured ${report.results.length}/${cases.length}; scientific review pending.`);
 }
 report.status='awaiting_independent_review';
 console.log('Capture finished. No scientific pass rate is assigned until review.');
 process.exitCode=2;
}finally{await checkpoint();await client.auth.signOut();}
