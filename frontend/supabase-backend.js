import {createClient} from '@supabase/supabase-js';
const client=createClient(__SUPABASE_URL__,__SUPABASE_KEY__,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce'}});
const callbackURL=new URL(location.href);
const callbackParams=new URLSearchParams(location.hash.slice(1));
const hasCallbackError=['error','error_code','error_description'].some(k=>callbackURL.searchParams.has(k)||callbackParams.has(k));
const ready=client.auth.initialize().then(({error})=>{
  const failed=error||hasCallbackError||(callbackURL.searchParams.has('code')&&new URL(location.href).searchParams.has('code'));
  if(failed){
    window.SpaceMindAuthError='That sign-in link expired, was cancelled, or could not be verified. Try Google or Apple again, or request a fresh email link and open it in this browser.';
    const clean=new URL(location.href);
    for(const key of ['code','sb_flow_id','error','error_code','error_description'])clean.searchParams.delete(key);
    clean.hash='';history.replaceState(history.state,'',clean.href);
  }
});
const defaults={depth:'technical',mode:'auto',scene:'universe',motion:true,speed:.5,brightness:.65,quality:'auto',font_size:'medium'};
function fail(message,status=400){const error=new Error(message);error.status=status;throw error;}
function checked({data,error}){if(error){const status=error.name==='AuthSessionMissingError'?401:error.status||(['PGRST301','PGRST302'].includes(error.code)?401:400);const messages={email_not_confirmed:'Please confirm your email first. Check your inbox and spam folder, or resend the confirmation below.',invalid_credentials:'Email or password is incorrect. If you registered with Google or Apple, use that sign-in button.',over_email_send_rate_limit:'Please wait before requesting another email. Check your inbox and spam folder.'};fail(messages[error.code]||error.message,status);}return data;}
async function user(){const data=checked(await client.auth.getUser());if(!data?.user)fail('Please sign in to continue.',401);return data.user;}
async function profile(){const u=await user();const {data,error}=await client.from('profiles').select('name,settings').eq('id',u.id).single();if(error)fail('Your profile is unavailable. Check that the Supabase migration was applied.');return {id:u.id,email:u.email,name:data.name,settings:{...defaults,...data.settings}};}
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
