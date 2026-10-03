import {createClient} from '@supabase/supabase-js';
// One owner for the callback: do not race automatic detection and a manual exchange.
const client=createClient(__SUPABASE_URL__,__SUPABASE_KEY__,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,flowType:'pkce'}});
const callbackURL=new URL(location.href);
const callbackParams=new URLSearchParams(callbackURL.hash.slice(1));
const callbackValue=key=>callbackURL.searchParams.get(key)||callbackParams.get(key);
function callbackMessage(error){
  const code=error?.code||error?.details?.code||error?.name||'unknown';
  const messages={
    access_denied:'Sign-in was cancelled. Choose your sign-in provider to start again.',
    pkce_code_verifier_not_found:'This browser lost the pending sign-in. Open SpaceMind directly in Safari and start sign-in there, keeping the same tab.',
    AuthPKCECodeVerifierMissingError:'This browser lost the pending sign-in. Open SpaceMind directly in Safari and start sign-in there, keeping the same tab.',
    flow_state_not_found:'This sign-in has already been used or expired. Start a new sign-in from SpaceMind.',
    flow_state_expired:'This sign-in expired. Start a new sign-in from SpaceMind.',
    bad_code_verifier:'Another sign-in replaced this attempt. Close other SpaceMind login tabs and start one new sign-in.',
    AuthRetryableFetchError:'The login service could not be reached. Check your connection and start sign-in again.',
    AuthInvalidTokenResponseError:'The login service returned an incomplete session. Please share this error code so we can investigate.'
  };
  // Show only a bounded identifier, never provider descriptions, URLs or tokens.
  const safeCode=/^[a-zA-Z][a-zA-Z0-9_]{0,79}$/.test(code)?code:'unknown';
  return (messages[code]||'SpaceMind could not finish signing you in. Please share the error code below.')+' [AUTH: '+safeCode+']';
}
const ready=(async()=>{
  const isCallback=Boolean(callbackValue('code')||callbackValue('error')||callbackValue('error_code')||callbackValue('error_description'));
  try{
    const {error:initialError}=await client.auth.initialize();
    if(initialError)throw initialError;
    if(callbackValue('error')||callbackValue('error_code')||callbackValue('error_description'))throw {code:callbackValue('error_code')||callbackValue('error')||'provider_error'};
    const code=callbackValue('code');
    if(code){
      const flowId=callbackValue('sb_flow_id');
      const {data,error}=await client.auth.exchangeCodeForSession(code,flowId?{flowId}:undefined);
      if(error)throw error;
      if(!data?.session)throw {code:'session_missing'};
    }
  }catch(error){window.SpaceMindAuthError=callbackMessage(error);}
  finally{
    if(isCallback){
      const clean=new URL(location.href);
      for(const key of ['code','sb_flow_id','error','error_code','error_description'])clean.searchParams.delete(key);
      clean.hash='';history.replaceState(history.state,'',clean.href);
    }
  }
})();
const defaults={depth:'technical',mode:'auto',scene:'universe',motion:true,speed:.5,brightness:.65,quality:'auto',font_size:'medium'};
function fail(message,status=400){const error=new Error(message);error.status=status;throw error;}
function checked({data,error}){if(error){const status=error.name==='AuthSessionMissingError'?401:error.status||(['PGRST301','PGRST302'].includes(error.code)?401:400);const messages={email_not_confirmed:'Please confirm your email first. Check your inbox and spam folder, or resend the confirmation below.',invalid_credentials:'Email or password is incorrect. If you registered with Google or Apple, use that sign-in button.',over_email_send_rate_limit:'Please wait before requesting another email. Check your inbox and spam folder.'};fail(messages[error.code]||error.message,status);}return data;}
async function user(){const data=checked(await client.auth.getUser());if(!data?.user)fail('Please sign in to continue.',401);return data.user;}
async function profile(){const u=await user();const {data,error}=await client.from('profiles').select('name,settings').eq('id',u.id).single();if(error)fail('Your profile could not be loaded. Please refresh and try again.');return {id:u.id,email:u.email,name:data.name,settings:{...defaults,...data.settings}};}
async function allRows(table,configure=q=>q){let rows=[];for(let offset=0;;offset+=500){const batch=checked(await configure(client.from(table).select('*')).range(offset,offset+499));rows.push(...batch);if(batch.length<500)return rows;}}
async function invoke(name,body,method='POST'){
  const {data,error}=await client.functions.invoke(name,{body,method});
  if(error){let detail;try{detail=await error.context?.json();}catch{}fail(detail?.detail||'The research service is unavailable. Please try again.',error.context?.status||503);}return data;
}
async function reauthenticate(password){const u=await user();checked(await client.auth.signInWithPassword({email:u.email,password}));return u;}
async function request(path,options={}){
  await ready;
  const method=options.method||'GET',body=options.body?JSON.parse(options.body):{};
  if(path==='/auth/oauth'){
    if(!['google','apple'].includes(body.provider))fail('Unsupported sign-in provider.');
    const name=body.provider==='google'?'Google':'Apple';
    let settings;
    try{const response=await fetch(__SUPABASE_URL__+'/auth/v1/settings',{headers:{apikey:__SUPABASE_KEY__},signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error();settings=await response.json();}
    catch{fail('Unable to check sign-in availability. Please check your connection and try again.');}
    if(!settings.external?.[body.provider])fail(name+' sign-in is not available yet. Please use email for now.');
    try{const key='spacemind-auth-storage-check';localStorage.setItem(key,'1');if(localStorage.getItem(key)!=='1')throw new Error();localStorage.removeItem(key);}
    catch{fail('Your browser is blocking sign-in storage. Allow website data for SpaceMind, then try again. [AUTH: storage_unavailable]');}
    checked(await client.auth.signInWithOAuth({provider:body.provider,options:{redirectTo:location.origin+'/',...(body.provider==='google'?{queryParams:{prompt:'select_account'}}:{})}}));
    return {redirecting:true};
  }
  if(path==='/auth/resend'){checked(await client.auth.resend({type:'signup',email:body.email,options:{emailRedirectTo:location.origin+'/'}}));return {ok:true};}
  if(path==='/auth/signup'){
    const data=checked(await client.auth.signUp({email:body.email,password:body.password,options:{data:{name:body.name},emailRedirectTo:location.origin+'/'}}));
    return data.session?profile():{requires_confirmation:true};
  }
  if(path==='/auth/login'){checked(await client.auth.signInWithPassword({email:body.email,password:body.password}));return profile();}
  if(path==='/auth/logout'){checked(await client.auth.signOut({scope:'local'}));return {ok:true};}
  if(path==='/auth/reset'){checked(await client.auth.resetPasswordForEmail(body.email,{redirectTo:location.origin+'/'}));return {ok:true};}
  if(path==='/auth/recovery'){checked(await client.auth.updateUser({password:body.new_password}));return {ok:true};}
  if(path==='/auth/password'){
    await reauthenticate(body.current_password);checked(await client.auth.updateUser({password:body.new_password}));checked(await client.auth.signOut({scope:'others'}));return {ok:true};
  }
  if(path==='/auth/me'){
    if(method==='GET')return profile();
    if(method==='PATCH'){const u=await user();checked(await client.from('profiles').update({name:body.name,settings:body.settings}).eq('id',u.id));return profile();}
    if(method==='DELETE'){await invoke('account',{password:body.password});await client.auth.signOut({scope:'local'});return {ok:true};}
  }
  const u=await user();
  if(path==='/chats'){
    if(method==='GET')return allRows('chats',q=>q.eq('user_id',u.id).order('pinned',{ascending:false}).order('updated_at',{ascending:false}).order('id'));
    if(method==='POST')return checked(await client.from('chats').insert({user_id:u.id,title:'New chat'}).select().single());
    if(method==='DELETE'){checked(await client.from('chats').delete().eq('user_id',u.id));return {ok:true};}
  }
  if(path.startsWith('/chats/')){
    const id=path.slice(7);
    if(method==='GET'){
      const chat=checked(await client.from('chats').select('*').eq('id',id).eq('user_id',u.id).single());
      chat.messages=await allRows('messages',q=>q.eq('chat_id',id).order('id'));return chat;
    }
    if(method==='PATCH'){checked(await client.from('chats').update({title:body.title,pinned:body.pinned}).eq('id',id).eq('user_id',u.id).select('id').single());return {ok:true};}
    if(method==='DELETE'){checked(await client.from('chats').delete().eq('id',id).eq('user_id',u.id).select('id').single());return {ok:true};}
  }
  if(path==='/ask')return invoke('research',body);
  if(path==='/capabilities')return invoke('research',undefined,'GET');
  if(path==='/library')return allRows('paper_library',q=>q.order('doc_id'));
  if(path==='/learning-paths'){const r=await fetch('/assets/learning_paths.json');if(!r.ok)fail('Learning paths are unavailable.');return r.json();}
  if(path==='/export'){
    const [p,chats,messages]=await Promise.all([profile(),allRows('chats',q=>q.eq('user_id',u.id).order('id')),allRows('messages',q=>q.order('id'))]);
    return {profile:p,chats:chats.map(c=>({...c,messages:messages.filter(m=>m.chat_id===c.id)}))};
  }
  fail('Unknown request.',404);
}
client.auth.onAuthStateChange(event=>{
  // Never await an auth method inside this callback (SDK locks can deadlock).
  if(event==='PASSWORD_RECOVERY'){window.SpaceMindRecoveryPending=true;setTimeout(()=>window.dispatchEvent(new Event('spacemind-recovery')),0);}
  if(event==='SIGNED_OUT')setTimeout(()=>window.dispatchEvent(new Event('spacemind-signed-out')),0);
});
window.SpaceMindBackend={request,provider:'supabase'};
