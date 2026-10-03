import test from 'node:test';
import assert from 'node:assert/strict';
import {research,validateQuestion,groq} from '../../supabase/functions/_shared/research.js';
import {bodyJSON,cors,safeURL} from '../../supabase/functions/_shared/http.js';
import {makeHandler} from '../../supabase/functions/research/handler.js';
const id='33333333-3333-4333-8333-333333333333';
const input={question:'Mars',chatId:id,depth:'technical',useWeb:false};
const paper={source_file:'Mars paper',origin:'arxiv',url:'https://arxiv.org/abs/1234',snippet:'Mars has ice'};
const response=data=>new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
const model=answer=>async()=>response({choices:[{message:{content:JSON.stringify({answer,confident:true,follow_up_questions:['Why?']})}}]});
test('validates question, chat and mode',()=>{assert.equal(validateQuestion({question:'Mars',chat_id:id}).question,'Mars');for(const value of [{question:'',chat_id:id},{question:'Mars',chat_id:'x'},{question:'Mars',chat_id:id,use_web:'true'}])assert.throws(()=>validateQuestion(value));});
test('forced web fails explicitly without key and never queries papers',async()=>{await assert.rejects(research({...input,useWeb:true},[],{env:{},lookupPapers:()=>assert.fail('paper fallback')}),/not configured/);});
test('papers mode returns sourced short astronomy query',async()=>{const r=await research(input,[],{env:{GROQ_API_KEY:'test'},lookupPapers:async()=>[paper],fetcher:model('Mars has ice [1].')});assert.equal(r.confident,true);assert.equal(r.used_web,false);assert.equal(r.citations.length,1);});
test('invalid citations lower confidence',async()=>{const r=await research(input,[],{env:{GROQ_API_KEY:'test'},lookupPapers:async()=>[paper],fetcher:model('Mars [99]')});assert.equal(r.confident,false);assert.match(r.warnings[0],/invalid/);});
test('empty evidence never invokes model',async()=>{const r=await research(input,[],{env:{},lookupPapers:async()=>[],fetcher:()=>assert.fail('no model without evidence')});assert.equal(r.confident,false);});
test('web uses Tavily evidence and excludes unsafe URLs',async()=>{let calls=[];const r=await research({...input,useWeb:true},[],{env:{TAVILY_API_KEY:'test',GROQ_API_KEY:'test'},lookupPapers:()=>assert.fail(),fetcher:async(url)=>{calls.push(url);return url.includes('tavily')?response({results:[{title:'Mars',url:'https://nasa.gov/mars',content:'Ice'},{url:'javascript:alert(1)',content:'bad'}]}):model('Ice [1]')();}});assert.equal(r.used_web,true);assert.equal(r.citations.length,1);assert.equal(calls.length,2);});
test('source failures remain visible',async()=>{const r=await research(input,[],{env:{},lookupPapers:async()=>{throw Error('fail')}});assert.match(r.warnings[0],/could not/);});
test('bounded JSON and unsafe URL checks',async()=>{assert.equal(safeURL('javascript:alert(1)'),null);await assert.rejects(bodyJSON(new Request('https://test',{method:'POST',body:'x'.repeat(30)}),10),/large/);});
function fixture({owner=true,quota=true,auth=true}={}){let external=0,saved;const client={auth:{getUser:async()=>({data:{user:auth?{id:'owner'}:null}})},from:()=>({select(){return this},eq(){return this},order(){return this},maybeSingle:async()=>({data:owner?{id}:null}),limit:async()=>({data:[]})}),rpc:async(name,args)=>{if(name==='consume_research_quota')return {data:quota};if(name==='match_papers')return {data:[]};saved=args;return {data:1}}};return {handler:makeHandler({createClient:()=>client,env:{ALLOWED_ORIGINS:'https://app.test'},embed:async()=>[],fetcher:()=>external++}),external:()=>external,saved:()=>saved};}
const request=(headers={authorization:'Bearer test',origin:'https://app.test'})=>new Request('https://test',{method:'POST',headers,body:JSON.stringify({question:'hello',chat_id:id})});
test('unauthenticated requests denied before providers',async()=>{const f=fixture();assert.equal((await f.handler(request({origin:'https://app.test'}))).status,401);assert.equal(f.external(),0);});
test('foreign chats and exhausted quota denied',async()=>{assert.equal((await fixture({owner:false}).handler(request())).status,404);assert.equal((await fixture({quota:false}).handler(request())).status,429);});
test('untrusted origin denied',async()=>{assert.equal((await fixture().handler(request({origin:'https://evil.test'}))).status,403);});
test('production preflight works with no origin secret, but unrelated origins stay blocked',async()=>{
  const origin='https://spacemind-frontend.vercel.app';
  const handler=makeHandler({env:{},createClient:()=>assert.fail('preflight must not access Auth'),embed:()=>assert.fail('preflight must not invoke AI')});
  const response=await handler(new Request('https://test',{method:'OPTIONS',headers:{origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,apikey,content-type,x-client-info'}}));
  assert.equal(response.status,204);assert.equal(response.headers.get('Access-Control-Allow-Origin'),origin);
  assert.match(response.headers.get('Access-Control-Allow-Headers'),/authorization/);
  assert.throws(()=>cors(new Request('https://test',{headers:{origin:'https://spacemind-frontend.vercel.app.evil.test'}}),''));
  const unauthenticated=await handler(new Request('https://test',{headers:{origin}}));
  assert.equal(unauthenticated.status,401);assert.equal(unauthenticated.headers.get('Access-Control-Allow-Origin'),origin);
});
test('authenticated turn persists with warnings',async()=>{const f=fixture();assert.equal((await f.handler(request())).status,200);assert.deepEqual(f.saved().p_warnings,[]);});

test('casual shorthand answers directly in every mode without model or search',async()=>{
  for(const question of ['how r you','How are u?','hru','hello!','thanks bro','bye'])for(const useWeb of [null,false,true]){
    const r=await research({...input,question,useWeb},[{question:'hi',answer:'Hey!'}],{env:{},lookupPapers:()=>assert.fail('no papers'),fetcher:()=>assert.fail('no provider')});
    assert(r.answer.length>5);assert.equal(r.confident,true);assert.equal(r.used_web,false);assert.deepEqual(r.citations,[]);
  }
});
test('auto mode handles contextual ordinary conversation without evidence search',async()=>{
  const history=[{question:'My name is Kamil',answer:'Nice to meet you, Kamil!'}];
  const r=await research({...input,question:'what is my name?',useWeb:null},history,{env:{GROQ_API_KEY:'test'},lookupPapers:()=>assert.fail('no papers'),fetcher:async(url,opts)=>{
    assert(url.includes('groq'));const body=JSON.parse(opts.body);assert.equal(JSON.parse(body.messages[1].content).history[0].question,history[0].question);
    return response({choices:[{message:{content:JSON.stringify({mode:'chat',answer:'You told me your name is Kamil.'})},finish_reason:'stop'}]});
  }});assert.match(r.answer,/Kamil/);assert.deepEqual(r.warnings,[]);assert.deepEqual(r.citations,[]);
});
test('auto mode sends astronomy follow-ups through evidence retrieval',async()=>{
  let calls=0,query;const r=await research({...input,question:'why does it have ice?',useWeb:null},[{question:'Tell me about Mars',answer:'Mars has polar ice.'}],{env:{GROQ_API_KEY:'test'},lookupPapers:async q=>{query=q;return [paper]},fetcher:async()=>{
    if(++calls===1)return response({choices:[{message:{content:JSON.stringify({mode:'research',query:'Why does Mars have polar ice?'})}}]});
    return model('Mars has ice [1].')();
  }});assert.match(query,/Mars/);assert.equal(calls,2);assert.equal(r.citations.length,1);assert.equal(r.confident,true);
});
test('greetings with research requests are not swallowed by casual matching',async()=>{
  const r=await research({...input,question:'Hi, explain black holes',useWeb:false},[],{env:{GROQ_API_KEY:'test'},lookupPapers:async()=>[paper],fetcher:model('Evidence [1].')});assert.equal(r.citations.length,1);
});
test('reasoning budget exhaustion retries once and never exposes reasoning',async()=>{
  const budgets=[];const text=await groq([{role:'user',content:'test'}],{GROQ_API_KEY:'test'},async(_,opts)=>{
    const body=JSON.parse(opts.body);budgets.push(body.max_completion_tokens);assert.equal(body.reasoning_effort,'low');assert.equal(body.include_reasoning,false);
    return response({choices:[budgets.length===1?{finish_reason:'length',message:{content:'',reasoning:'PRIVATE REASONING'}}:{finish_reason:'stop',message:{content:'Final answer'}}]});
  },false,512);assert.equal(text,'Final answer');assert.deepEqual(budgets,[2048,4096]);
});
test('repeated empty output fails after bounded attempts',async()=>{
  let calls=0;await assert.rejects(groq([],{GROQ_API_KEY:'test'},async()=>{calls++;return response({choices:[{finish_reason:'length',message:{content:'',reasoning:'PRIVATE'}}]})}),/could not finish/);assert.equal(calls,2);
});
test('non-reasoning model overrides do not receive reasoning-only parameters',async()=>{
  await groq([],{GROQ_API_KEY:'test',GROQ_MODEL:'custom-model'},async(_,opts)=>{const body=JSON.parse(opts.body);assert(!('reasoning_effort' in body));assert(!('include_reasoning' in body));return response({choices:[{message:{content:'Answer'}}]});});
});
