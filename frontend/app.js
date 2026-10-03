'use strict';
const $ = id => document.getElementById(id);
const state = {user:null, chats:[], chat:null, busy:false, signup:false, web:false, prefs:null};
const safe = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeURL = value => {try {const u=new URL(value); return ['https:','http:'].includes(u.protocol)?u.href:null;}catch{return null;}};
let toastTimer;
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4500);}
async function api(path, options={}) {
  if(window.SpaceMindBackend){try{return await window.SpaceMindBackend.request(path,options);}catch(error){if(error.status===401&&state.user)showAuth();throw error;}}
  let response;
  try {response=await fetch(path,{...options,credentials:'same-origin',headers:{'Content-Type':'application/json','X-SpaceMind':'1',...options.headers}});}
  catch {throw new Error('Connection lost. Check your connection and try again.');}
  const data=await response.json().catch(()=>({}));
  if(!response.ok){
    if(response.status===401 && state.user) showAuth();
    let message=typeof data.detail==='string'?data.detail:response.status===429?'Too many requests. Please wait a moment and try again.':'Please check your entries and try again.';
    const error=new Error(message);error.status=response.status;throw error;
  }
  return data;
}
const post=(path,body={})=>api(path,{method:'POST',body:JSON.stringify(body)});
function showAuth(){
  state.user=null;state.chat=null;state.chats=[];state.prefs=null;
  $('workspace').hidden=true;$('auth').hidden=false;$('loading').hidden=true;
  $('messages').replaceChildren();$('chatList').replaceChildren();$('question').value='';$('searchChats').value='';
  $('authPassword').value='';$('authError').textContent='';
  document.querySelectorAll('dialog[open]').forEach(d=>d.close());
  window.SpaceUniverse?.configure({scene:'universe',motion:true,speed:.3,brightness:.7,quality:'auto'});
}
function authMode(signup){state.signup=signup;$('nameField').hidden=!signup;$('authName').required=signup;
  $('authTitle').textContent=signup?'Make room for curiosity.':'Welcome back.';
  $('authSubtitle').textContent=signup?'Your research starts here.':'A little curiosity goes a long way.';
  $('authSubmit').textContent=signup?'Create account':'Sign in';
  $('loginTab').classList.toggle('selected',!signup);$('signupTab').classList.toggle('selected',signup);
  $('authPassword').autocomplete=signup?'new-password':'current-password';$('authError').textContent='';
}
$('loginTab').onclick=()=>authMode(false);$('signupTab').onclick=()=>authMode(true);
$('showPassword').onclick=()=>{const hidden=$('authPassword').type==='password';$('authPassword').type=hidden?'text':'password';$('showPassword').textContent=hidden?'Hide':'Show';$('showPassword').setAttribute('aria-label',hidden?'Hide password':'Show password');};
$('authForm').onsubmit=async event=>{event.preventDefault();$('authSubmit').disabled=true;$('authError').textContent='';
  try{const user=await post(state.signup?'/auth/signup':'/auth/login',{name:$('authName').value.trim(),email:$('authEmail').value.trim(),password:$('authPassword').value});$('authPassword').value='';if(user.requires_confirmation){authMode(false);$('authError').textContent='Check your email to confirm your account, then sign in.';}else await enterWorkspace(user);}
  catch(error){$('authError').textContent=error.message;}finally{$('authSubmit').disabled=false;}
};
function applyPreferences(prefs){
  state.prefs={...prefs};window.SpaceUniverse?.configure(prefs);
  document.documentElement.style.setProperty('--font',({small:'13px',medium:'15px',large:'17px'})[prefs.font_size]);
  $('researchMode').value=prefs.mode;$('answerDepth').value=prefs.depth;
  $('motionToggle').textContent=prefs.motion?'Ⅱ':'▷';
  $('motionToggle').setAttribute('aria-label',prefs.motion?'Pause background animation':'Resume background animation');
  $('motionToggle').title=prefs.motion?'Pause background animation':'Resume background animation';
}
async function enterWorkspace(user){state.user=user;$('auth').hidden=true;$('workspace').hidden=false;$('loading').hidden=true;
  $('profileName').textContent=user.name;$('profileInitial').textContent=user.name[0].toUpperCase();
  applyPreferences(user.settings);resetChat();
  try{await refreshChats();const c=await api('/capabilities');state.web=c.web_search;}
  catch(error){toast(error.message);}updateCapabilityNote();
}
function updateCapabilityNote(){
  $('webAvailability').textContent=state.web?'Live web research is available.':'Live web research has not been configured by the server operator. Papers only is available once the index and model are ready.';
  $('composerNote').textContent=$('researchMode').value==='web'&&!state.web?'Web search is not configured on this server.':'Explore with curiosity. Check the sources.';
}
function sidebar(open){$('sidebar').classList.toggle('open',open);$('sidebarShade').hidden=!open;}
$('openSidebar').onclick=()=>sidebar(true);$('closeSidebar').onclick=()=>sidebar(false);$('sidebarShade').onclick=()=>sidebar(false);
function resetChat(){state.chat=null;$('messages').replaceChildren();$('empty').hidden=false;$('chatTitle').textContent='New chat';$('question').value='';$('question').style.height='auto';renderChats();sidebar(false);}
$('newChat').onclick=()=>{if(state.busy)return toast('Please wait for the current answer.');resetChat();$('question').focus();};
async function refreshChats(){state.chats=await api('/chats');renderChats();}
function renderChats(){
  const box=$('chatList');box.replaceChildren();const q=$('searchChats').value.toLowerCase();const chats=state.chats.filter(c=>c.title.toLowerCase().includes(q));
  if(!chats.length){const p=document.createElement('p');p.className='history-empty';p.textContent=q?'No matching conversations.':'Your conversations will appear here.';box.append(p);}
  chats.forEach(chat=>{const row=document.createElement('div');row.className='chat-item'+(state.chat?.id===chat.id?' active':'');
    const b=document.createElement('button');b.className='chat-open';b.textContent=(chat.pinned?'✦ ':'')+chat.title;b.title=chat.title;b.onclick=()=>openChat(chat.id);
    const more=document.createElement('button');more.className='chat-menu';more.textContent='⋯';more.setAttribute('aria-label','Options for '+chat.title);more.onclick=()=>chatOptions(chat);
    row.append(b,more);box.append(row);
  });
}
$('searchChats').oninput=renderChats;
async function openChat(id){if(state.busy)return toast('Please wait for the current answer.');
  try{const chat=await api('/chats/'+id);state.chat=chat;$('messages').replaceChildren();$('empty').hidden=chat.messages.length>0;$('chatTitle').textContent=chat.title;
    chat.messages.forEach(m=>renderTurn(m.question,m));renderChats();sidebar(false);scrollBottom();}
  catch(error){toast(error.message);}
}
function formattedAnswer(answer){return safe(answer).replace(/\*\*([^*\n]+)\*\*/g,'<strong>$1</strong>').replace(/`([^`\n]+)`/g,'<code>$1</code>');}
function renderTurn(question, result=null){
  const turn=document.createElement('article');turn.className='turn';
  turn.innerHTML='<div class="user-message"></div><div class="assistant-heading"><span aria-hidden="true">✦</span><span>SpaceMind</span></div><div class="answer-body"></div>';
  turn.querySelector('.user-message').textContent=question;$('messages').append(turn);
  const body=turn.querySelector('.answer-body');
  if(!result){body.innerHTML='<p class="pending" role="status">'+($('researchMode').value==='web'?'Searching the web…':'Following the evidence…')+'</p>';}
  else fillAnswer(body,result);
  return body;
}
function fillAnswer(body,result){
  body.replaceChildren();
  (result.warnings||[]).forEach(w=>{const p=document.createElement('p');p.className='notice';p.textContent=w;body.append(p);});
  if(!result.confident){const n=document.createElement('p');n.className='notice';n.textContent='Limited evidence — check the sources before drawing conclusions.';body.append(n);}
  if(result.used_web){const n=document.createElement('p');n.className='notice';n.textContent='Researched on the live web';body.append(n);}
  const answer=document.createElement('div');answer.className='answer';answer.innerHTML=formattedAnswer(result.answer);body.append(answer);
  if(result.citations?.length){
    const sources=document.createElement('details');sources.className='sources';const summary=document.createElement('summary');summary.textContent=result.citations.length+' sources';sources.append(summary);
    result.citations.forEach((c,i)=>{const card=document.createElement('div');card.className='source';const url=safeURL(c.url);
      const title=document.createElement(url?'a':'span');title.textContent=`[${i+1}] ${c.source_file || c.origin || 'Source'}`;
      if(url){title.href=url;title.target='_blank';title.rel='noopener noreferrer';}const snippet=document.createElement('p');snippet.textContent=c.snippet;card.append(title,snippet);sources.append(card);
    });body.append(sources);
  }
  if(result.follow_up_questions?.length){const follow=document.createElement('div');follow.className='followups';result.follow_up_questions.forEach(q=>{const b=document.createElement('button');b.textContent=q;b.onclick=()=>{if(!state.busy){$('question').value=q;$('question').focus();}};follow.append(b);});body.append(follow);}
  const actions=document.createElement('div');actions.className='answer-actions';const copy=document.createElement('button');copy.className='text-button';copy.textContent='Copy answer';copy.onclick=async()=>{try{await navigator.clipboard.writeText(result.answer);toast('Answer copied.');}catch{toast('Clipboard is unavailable. You can select and copy the answer.');}};actions.append(copy);body.append(actions);
}
function scrollBottom(){$('chatScroll').scrollTop=$('chatScroll').scrollHeight;}
$('question').oninput=()=>{$('question').style.height='auto';$('question').style.height=Math.min($('question').scrollHeight,180)+'px';};
$('question').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();$('chatForm').requestSubmit();}};
$('chatForm').onsubmit=async event=>{
  event.preventDefault();const question=$('question').value.trim();if(!question||state.busy)return;
  state.busy=true;$('send').disabled=true;$('question').disabled=true;$('newChat').disabled=true;
  let body;
  try{
    if(!state.chat){state.chat=await post('/chats');state.chats.unshift(state.chat);renderChats();}
    $('empty').hidden=true;$('question').value='';$('question').style.height='auto';body=renderTurn(question);scrollBottom();
    const result=await post('/ask',{question,chat_id:state.chat.id,depth:$('answerDepth').value,use_web:({auto:null,web:true,papers:false})[$('researchMode').value]});
    fillAnswer(body,result);await refreshChats();state.chat=state.chats.find(c=>c.id===state.chat.id)||state.chat;$('chatTitle').textContent=state.chat.title;
  }catch(error){if(body){body.replaceChildren();const p=document.createElement('p');p.className='error';p.textContent=error.message;body.append(p);const retry=document.createElement('button');retry.className='secondary';retry.textContent='Try again';retry.onclick=()=>{$('question').value=question;$('question').focus();body.closest('.turn').remove();$('chatForm').requestSubmit();};body.append(retry);}else toast(error.message);$('question').value=question;}
  finally{state.busy=false;$('send').disabled=false;$('question').disabled=false;$('newChat').disabled=false;scrollBottom();if(state.user)$('question').focus();}
};
$('researchMode').onchange=updateCapabilityNote;
function askAction({title,description='',label='',value='',password=false,confirm='Confirm',danger=false}){
  return new Promise(resolve=>{const dialog=$('actionDialog');$('actionTitle').textContent=title;$('actionDescription').textContent=description;$('actionLabel').hidden=!label;$('actionLabelText').textContent=label;
    $('actionInput').value=value;$('actionInput').type=password?'password':'text';$('actionInput').required=!!label;$('actionInput').autocomplete=password?'current-password':'off';
    $('actionConfirm').textContent=confirm;$('actionConfirm').className=danger?'danger':'primary';
    let done=false;const finish=result=>{if(done)return;done=true;dialog.close();resolve(result);};
    $('actionForm').onsubmit=e=>{e.preventDefault();finish(label?$('actionInput').value:true);};$('actionCancel').onclick=()=>finish(null);dialog.oncancel=()=>finish(null);dialog.showModal();
  });
}
async function chatOptions(chat){if(state.busy)return toast('Please wait for the current answer.');
  const dialog=$('resourceDialog');$('resourceTitle').textContent=chat.title;$('resourceBody').innerHTML='<div class="chat-options"><button id="renameChat" class="secondary">Rename</button><button id="pinChat" class="secondary"></button><button id="deleteChat" class="danger">Delete</button></div>';$('pinChat').textContent=chat.pinned?'Unpin':'Pin chat';dialog.showModal();
  $('renameChat').onclick=async()=>{dialog.close();const title=await askAction({title:'Rename conversation',label:'Conversation title',value:chat.title,confirm:'Save'});if(!title?.trim())return;
    try{await api('/chats/'+chat.id,{method:'PATCH',body:JSON.stringify({title:title.trim().slice(0,120),pinned:!!chat.pinned})});await refreshChats();if(state.chat?.id===chat.id){state.chat.title=title;$('chatTitle').textContent=title;}}catch(e){toast(e.message);}};
  $('pinChat').onclick=async()=>{try{await api('/chats/'+chat.id,{method:'PATCH',body:JSON.stringify({title:chat.title,pinned:!chat.pinned})});dialog.close();await refreshChats();}catch(e){toast(e.message);}};
  $('deleteChat').onclick=async()=>{dialog.close();if(!await askAction({title:'Delete conversation?',description:'This conversation will be permanently removed.',confirm:'Delete',danger:true}))return;
    try{await api('/chats/'+chat.id,{method:'DELETE'});if(state.chat?.id===chat.id)resetChat();await refreshChats();}catch(e){toast(e.message);}};
}
function settingsPanel(name){document.querySelectorAll('[data-panel]').forEach(b=>b.classList.toggle('selected',b.dataset.panel===name));document.querySelectorAll('[data-section]').forEach(s=>s.hidden=s.dataset.section!==name);}
document.querySelectorAll('[data-panel]').forEach(b=>b.onclick=()=>settingsPanel(b.dataset.panel));
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());
$('settingsBtn').onclick=()=>{const s=state.user.settings;$('settingName').value=state.user.name;$('settingEmail').value=state.user.email;
  $('settingScene').value=s.scene;$('settingMotion').checked=s.motion;$('settingSpeed').value=s.speed;$('settingBrightness').value=s.brightness;$('settingQuality').value=s.quality;$('settingFont').value=s.font_size;$('settingMode').value=s.mode;$('settingDepth').value=s.depth;
  $('currentPassword').value='';$('newPassword').value='';$('settingsStatus').textContent='';settingsPanel('account');$('settingsDialog').showModal();
};
function readSettings(){return {scene:$('settingScene').value,motion:$('settingMotion').checked,speed:+$('settingSpeed').value,brightness:+$('settingBrightness').value,quality:$('settingQuality').value,font_size:$('settingFont').value,mode:$('settingMode').value,depth:$('settingDepth').value};}
['settingScene','settingMotion','settingSpeed','settingBrightness','settingQuality','settingFont'].forEach(id=>$(id).oninput=()=>{const prefs=readSettings();window.SpaceUniverse?.configure(prefs);document.documentElement.style.setProperty('--font',({small:'13px',medium:'15px',large:'17px'})[prefs.font_size]);});
$('settingsDialog').addEventListener('close',()=>{if(state.user){window.SpaceUniverse?.configure(state.user.settings);document.documentElement.style.setProperty('--font',({small:'13px',medium:'15px',large:'17px'})[state.user.settings.font_size]);}});
$('saveSettings').onclick=async()=>{if(!$('settingName').value.trim()){$('settingsStatus').textContent='Enter your name.';return;}$('saveSettings').disabled=true;
  try{state.user=await api('/auth/me',{method:'PATCH',body:JSON.stringify({name:$('settingName').value.trim(),settings:readSettings()})});applyPreferences(state.user.settings);$('profileName').textContent=state.user.name;$('profileInitial').textContent=state.user.name[0].toUpperCase();updateCapabilityNote();$('settingsStatus').textContent='Changes saved.';}
  catch(e){$('settingsStatus').textContent=e.message;}finally{$('saveSettings').disabled=false;}
};
$('motionToggle').onclick=async()=>{if(!state.user)return;const prefs={...state.user.settings,motion:!state.user.settings.motion};
  try{state.user=await api('/auth/me',{method:'PATCH',body:JSON.stringify({name:state.user.name,settings:prefs})});applyPreferences(prefs);}catch(e){toast(e.message);}
};
$('changePassword').onclick=async()=>{if($('newPassword').value.length<10){$('settingsStatus').textContent='Use at least 10 characters for your new password.';return;}$('changePassword').disabled=true;
  try{await post('/auth/password',{current_password:$('currentPassword').value,new_password:$('newPassword').value});$('currentPassword').value='';$('newPassword').value='';$('settingsStatus').textContent='Password updated. Other sessions signed out.';}catch(e){$('settingsStatus').textContent=e.message;}finally{$('changePassword').disabled=false;}
};
$('signOut').onclick=async()=>{if(state.busy)return toast('Please wait for the current answer.');try{await post('/auth/logout');showAuth();}catch(e){toast(e.message);}};
$('exportData').onclick=async()=>{try{const data=await api('/export');const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='spacemind-conversations.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Export downloaded.');}catch(e){toast(e.message);}};
$('deleteAll').onclick=async()=>{if(state.busy)return toast('Please wait for the current answer.');if(!await askAction({title:'Delete all conversations?',description:'This permanently deletes every chat in your account.',confirm:'Delete all chats',danger:true}))return;
  try{await api('/chats',{method:'DELETE'});resetChat();await refreshChats();toast('All conversations deleted.');}catch(e){toast(e.message);}
};
$('deleteAccount').onclick=async()=>{if(state.busy)return toast('Please wait for the current answer.');const password=await askAction({title:'Delete your account?',description:'Your account and all conversations will be permanently removed.',label:'Confirm your password',password:true,confirm:'Delete account',danger:true});if(!password)return;
  try{await api('/auth/me',{method:'DELETE',body:JSON.stringify({password})});showAuth();toast('Account deleted.');}catch(e){toast(e.message);}
};
async function resources(kind){const dialog=$('resourceDialog');$('resourceTitle').textContent=kind==='library'?'Paper library':'Learning paths';$('resourceBody').textContent='Loading…';dialog.showModal();
  try{const data=await api(kind==='library'?'/library':'/learning-paths');const items=Array.isArray(data)?data:(data.papers||[]);const box=$('resourceBody');box.replaceChildren();
    if(!items.length){box.textContent='No '+(kind==='library'?'papers':'learning paths')+' available yet.';return;}
    items.forEach(item=>{const card=document.createElement('article');card.className='resource-card';const title=document.createElement('h3');title.textContent=item.title||item.doc_id||item.file_name||'Research paper';card.append(title);
      if(item.description){const p=document.createElement('p');p.textContent=item.description;card.append(p);}const url=safeURL(item.url);if(url){const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener noreferrer';a.textContent='Open paper ↗';card.append(a);}
      (item.starter_questions||[]).forEach(q=>{const b=document.createElement('button');b.className='secondary';b.textContent=q;b.onclick=()=>{dialog.close();$('question').value=q;$('question').focus();};card.append(b);});box.append(card);
    });
  }catch(e){$('resourceBody').textContent=e.message;}
}
$('libraryBtn').onclick=()=>resources('library');$('pathsBtn').onclick=()=>resources('paths');
document.addEventListener('keydown',e=>{if(e.key==='Escape')sidebar(false);});
$('forgotPassword').hidden=!window.SpaceMindBackend;
$('forgotPassword').onclick=async()=>{
 const email=$('authEmail').value.trim();if(!email){$('authError').textContent='Enter your email address first.';return;}
 $('forgotPassword').disabled=true;try{await post('/auth/reset',{email});$('authError').textContent='If that account exists, a password-reset email is on its way.';}catch(e){$('authError').textContent=e.message;}finally{$('forgotPassword').disabled=false;}
};
function showRecovery(){if(window.SpaceMindRecoveryPending&&!$('recoveryDialog').open)$('recoveryDialog').showModal();}
window.addEventListener('spacemind-recovery',showRecovery);
window.addEventListener('spacemind-signed-out',()=>{if(state.user)showAuth();});
$('recoveryForm').onsubmit=async e=>{e.preventDefault();const value=$('recoveryPassword').value;
 if(value!==$('recoveryConfirm').value){$('recoveryError').textContent='Passwords do not match.';return;}
 $('recoverySave').disabled=true;try{await post('/auth/recovery',{new_password:value});window.SpaceMindRecoveryPending=false;$('recoveryDialog').close();$('recoveryForm').reset();toast('Your password has been updated.');await enterWorkspace(await api('/auth/me'));}catch(err){$('recoveryError').textContent=err.message;}finally{$('recoverySave').disabled=false;}
};
(async()=>{try{await enterWorkspace(await api('/auth/me'));}catch(error){showAuth();if(error.status!==401)$('authError').textContent=error.message;}showRecovery();})();
