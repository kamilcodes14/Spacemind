// Full deployed-stack evaluation. Never uses service-role credentials or skips quota.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createClient} from '@supabase/supabase-js';
import {grade} from './eval-grade.mjs';
const required=['SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','EVAL_EMAIL','EVAL_PASSWORD'];
if(required.some(k=>!process.env[k]))throw Error('Deployed evaluation requires Supabase URL/public key and a dedicated confirmed test account in EVAL_EMAIL/EVAL_PASSWORD. No evaluation ran.');
const base=process.env.SUPABASE_URL.replace(/\/$/,'');
if(base!=='https://aqblctjucyxqjmylojgc.supabase.co')throw Error('Unexpected evaluation project. Review the target before running.');
const client=createClient(base,process.env.SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const auth=await client.auth.signInWithPassword({email:process.env.EVAL_EMAIL,password:process.env.EVAL_PASSWORD});
if(auth.error)throw Error('Test account sign-in failed. Verify protected CI credentials.');
const cases=JSON.parse(await readFile('evals/space-questions.json','utf8'));
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const report={created_at:new Date().toISOString(),target:base,revision:process.env.GITHUB_SHA||'local',rubric:'Keyword/numeric screening, not human scientific review.',results:[]};
await mkdir('evals/reports',{recursive:true});
const checkpoint=async()=>{
 const completed=report.results.filter(r=>!r.error),latencies=completed.map(r=>r.latency_ms).sort((a,b)=>a-b);
 report.summary={attempted:report.results.length,passed:report.results.filter(r=>r.pass).length,errors:report.results.filter(r=>r.error).length,empty_retrieval:completed.filter(r=>!r.source_count).length,p50_ms:latencies[Math.floor(latencies.length*.5)]??null,p95_ms:latencies[Math.min(latencies.length-1,Math.floor(latencies.length*.95))]??null};
 for(const file of ['evals/latest-report.json',`evals/reports/${stamp}.json`])await writeFile(file,JSON.stringify(report,null,2));
};
try{
 for(const item of cases){
  // Each question has its own chat to avoid contaminating subsequent answers.
  const chat=await client.from('chats').insert({user_id:auth.data.user.id,title:`Evaluation ${stamp} ${item.id}`}).select('id').single();
  if(chat.error)throw Error('Authenticated chat insert failed; stop and check RLS.');
  const started=Date.now();
  try{
   let response,requestStarted;
   for(let attempt=0;attempt<2;attempt++){
    const refreshed=await client.auth.refreshSession();
    if(refreshed.error)throw Error('Test session refresh failed.');
    requestStarted=Date.now();response=await fetch(base+'/functions/v1/research',{method:'POST',headers:{'Content-Type':'application/json',apikey:process.env.SUPABASE_PUBLISHABLE_KEY,Authorization:'Bearer '+refreshed.data.session.access_token},body:JSON.stringify({chat_id:chat.data.id,question:item.question,use_web:false,depth:'technical'}),signal:AbortSignal.timeout(180000)});
    if(response.status!==429||attempt===1)break;
    // Respect the existing 30/hour gate, then retry once in the next UTC hour.
    const until=(Math.floor(Date.now()/3600000)+1)*3600000+2000;
    console.log('Quota reached; preserving checkpoint and waiting for the next hour.');
    await checkpoint();while(Date.now()<until)await new Promise(r=>setTimeout(r,Math.min(30000,until-Date.now())));
   }
   if(!response.ok)throw Error(`Research HTTP ${response.status}`);
   const result=await response.json();
   const saved=await client.from('messages').select('id').eq('chat_id',chat.data.id).eq('id',result.message_id).single();
   if(saved.error)throw Error('Authenticated saved-answer read failed.');
   report.results.push({id:item.id,pass:grade(result.answer||'',item),latency_ms:Date.now()-requestStarted,total_elapsed_ms:Date.now()-started,source_count:result.citations?.length||0,verification_complete:result.verification_complete??false,confident:result.confident,answer:result.answer,citations:result.citations,warnings:result.warnings});
  }catch(error){report.results.push({id:item.id,pass:false,latency_ms:Date.now()-started,error:error.message});}
  await checkpoint();console.log(`Completed ${report.results.length}/${cases.length}`);
 }
 console.log(JSON.stringify(report.summary));
 if(report.summary.passed<45||report.summary.errors)process.exitCode=1;
}finally{await checkpoint();await client.auth.signOut();}
