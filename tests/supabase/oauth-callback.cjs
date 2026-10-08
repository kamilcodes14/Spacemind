// Run after building with SUPABASE_URL=https://example.supabase.co and SUPABASE_PUBLISHABLE_KEY=sb_publishable_test.
const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict'),{webcrypto}=require('node:crypto');
const bundle=fs.readFileSync(require('node:path').join(__dirname,'../../dist/assets/backend.js'),'utf8');
const values=new Map();let exchanges=0,mode='ok',blocked=false;
const uid='11111111-1111-4111-8111-111111111111',user={id:uid,email:'test@example.com',role:'authenticated',aud:'authenticated',user_metadata:{name:'Test'}};
const token=Buffer.from(JSON.stringify({alg:'HS256'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:uid,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.test';
function page(url){
 const location={href:url,origin:new URL(url).origin,hash:new URL(url).hash,assign(u){this.assigned=u;}};
 const storage={getItem:k=>values.get(k)??null,setItem(k,v){if(blocked)throw new Error('blocked');values.set(k,v);},removeItem:k=>values.delete(k)};
 const context={console,URL,URLSearchParams,Headers,Request,Response,TextEncoder,TextDecoder,atob,btoa,crypto:webcrypto,setTimeout,clearTimeout,setInterval,clearInterval,AbortController,AbortSignal,structuredClone,location,localStorage:storage,sessionStorage:storage,navigator:{},WebSocket:class{},document:{visibilityState:'visible',addEventListener(){},removeEventListener(){}},addEventListener(){},removeEventListener(){},dispatchEvent(){},Event:class{},history:{state:null,replaceState(_,__,u){location.href=u;location.hash=new URL(u).hash;}},fetch:async(input,opts={})=>{
 const u=new URL(typeof input==='string'?input:input.url);let body;
 if(u.pathname.endsWith('/settings'))body={external:{google:true,apple:true}};
 else if(u.pathname.endsWith('/token')){exchanges++;const b=JSON.parse(opts.body);assert(b.code_verifier);assert.equal(b.auth_code,'valid-code');if(mode==='rejected')return Response.json({code:'bad_code_verifier',message:'SECRET DO NOT DISPLAY'},{status:400,headers:{'x-supabase-api-version':'2024-01-01'}});body=mode==='incomplete'?{}:{access_token:token,refresh_token:'fake-refresh',expires_in:3600,token_type:'bearer',user};}
 else if(u.pathname.endsWith('/user'))body=user;
 else if(u.pathname.endsWith('/profiles'))body={name:'Test',settings:{}};
 else if(u.pathname.endsWith('/logout'))body={};else throw Error('Unexpected path '+u.pathname);
 return Response.json(body);
 }};context.window=context;context.globalThis=context;context.self=context;vm.createContext(context);vm.runInContext(bundle,context);return context;
}
async function oauth(p){await p.SpaceMindBackend.request('/auth/oauth',{method:'POST',body:JSON.stringify({provider:'google'})});assert(p.location.assigned);const u=new URL(p.location.assigned);assert.equal(u.searchParams.get('code_challenge_method'),'s256');assert.equal(u.searchParams.get('redirect_to'),'https://test.example/');}
(async()=>{
 let p=page('https://test.example/');await assert.rejects(p.SpaceMindBackend.request('/auth/oauth',{method:'POST',body:JSON.stringify({provider:'apple'})}),/Unsupported sign-in provider/);assert(!p.location.assigned);await oauth(p);p=page('https://test.example/?code=valid-code');assert.equal((await p.SpaceMindBackend.request('/auth/me')).name,'Test');assert.equal(exchanges,1);assert.equal(p.location.href,'https://test.example/');assert(!p.SpaceMindAuthError);
 p=page('https://test.example/');await p.SpaceMindBackend.request('/auth/me');assert.equal(exchanges,1);await p.SpaceMindBackend.request('/auth/logout');
 p=page('https://test.example/?code=missing-verifier');await p.SpaceMindBackend.request('/auth/me').catch(()=>{});assert.match(p.SpaceMindAuthError,/pending sign-in/);assert.equal(exchanges,1);
 p=page('https://test.example/?error=access_denied&error_description=SECRET');await p.SpaceMindBackend.request('/auth/me').catch(()=>{});assert.match(p.SpaceMindAuthError,/cancelled/);assert(!p.SpaceMindAuthError.includes('SECRET'));
 p=page('https://test.example/');blocked=true;await assert.rejects(oauth(p),/storage_unavailable/);assert(!p.location.assigned);blocked=false;
 for(const m of ['rejected','incomplete']){mode=m;p=page('https://test.example/');await oauth(p);p=page('https://test.example/?code=valid-code');await p.SpaceMindBackend.request('/auth/me').catch(()=>{});assert.match(p.SpaceMindAuthError,m==='rejected'?/bad_code_verifier/:/AuthInvalidTokenResponseError/);assert(!p.SpaceMindAuthError.includes('SECRET'));assert.equal(p.location.href,'https://test.example/');}
 mode='ok';p=page('https://test.example/');await oauth(p);for(const [k,v] of values)if(k.endsWith('-code-verifier'))values.set(k,JSON.stringify(JSON.parse(v)+'/recovery'));p=page('https://test.example/?code=valid-code');await p.SpaceMindBackend.request('/auth/me');assert.equal(p.SpaceMindRecoveryPending,true);
 console.log('PASS: actual bundled SDK, single PKCE exchange, persisted session, logout, missing verifier, cancellation, blocked storage, rejected and incomplete exchanges, password recovery; secrets excluded from errors.');process.exit(0);
})().catch(e=>{console.error(e);process.exit(1)});
