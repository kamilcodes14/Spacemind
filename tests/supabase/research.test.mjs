import test from 'node:test';
import assert from 'node:assert/strict';
import {research,validateQuestion,groq} from '../../supabase/functions/_shared/research.js';
import {bodyJSON,cors,safeURL} from '../../supabase/functions/_shared/http.js';
import {makeHandler} from '../../supabase/functions/research/handler.js';
const id='33333333-3333-4333-8333-333333333333';
const input={question:'Mars',chatId:id,depth:'technical',useWeb:false};
const paper={source_file:'Mars paper',origin:'arxiv',url:'https://arxiv.org/abs/1234',snippet:'Mars has ice'};
const response=data=>new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
const model=answer=>async(_url,options)=>{
 const body=options?JSON.parse(options.body):null;
 if(body?.messages?.[0]?.content.startsWith('Verify each')){
   const {claims}=JSON.parse(body.messages[1].content);
   return response({choices:[{message:{content:JSON.stringify({claims:claims.map(c=>({id:c.id,status:'supported',evidence:c.snippets.map(s=>({citation:s.citation,quote:s.text}))}))})}}]});
 }
 return response({choices:[{message:{content:JSON.stringify({answer,confident:true,follow_up_questions:['Why?']})}}]});
};

test('live space-weather questions fetch NOAA observations and ground Groq context in measurements',async()=>{
 let groqBody,upstream=[];
 const fetcher=async(url,options)=>{
  const u=String(url);upstream.push(u);
  if(u.includes('xray-flares'))return response([{begin_time:'2026-11-20T01:00:00Z',max_time:'2026-11-20T01:05:00Z',max_class:'M1.2'}]);
  if(u.includes('plasma-7-day'))return response([['time_tag','density','speed','temperature'],['2026-11-20T01:00:00Z','5.5','620','100000']]);
  if(u.includes('planetary-k-index'))return response([['time_tag','Kp'],['2026-11-20T00:00:00Z','5.67']]);
  if(u.includes('mag-7-day'))return response([['time_tag','bz_gsm','bt'],['2026-11-20T01:00:00Z','-7.2','8.1']]);
  if(u.includes('/products/alerts.json'))return response([]);
  if(u.includes('DONKI'))return response([]);
  groqBody=JSON.parse(options.body);
  return response({choices:[{message:{content:'The latest NOAA records show solar-wind speed of 620 km/s and Kp 5.67 at the supplied observation times. This is an observation, not a forecast.'}}]});
 };
 const r=await research({...input,question:'What is the current Kp index and is there a solar storm?',useWeb:false},[],{env:{GROQ_API_KEY:'test'},lookupPapers:()=>assert.fail('weather must not query papers'),fetcher});
 assert.equal(r.answer.includes('620 km/s'),true);
 assert.ok(r.citations.some(c=>c.origin==='noaa_swpc'));
 assert.ok(groqBody.messages[1].content.includes('5.67'));
 assert.ok(groqBody.messages[1].content.includes('620'));
 assert.ok(upstream.some(u=>u.includes('plasma-7-day')));
 assert.ok(upstream.some(u=>u.includes('planetary-k-index')));
});
test('live space-weather answers honestly report unavailable NOAA data',async()=>{
 const r=await research({...input,question:'Is there a solar storm happening right now?',useWeb:false},[],{env:{},lookupPapers:()=>assert.fail(),fetcher:async()=>{throw Error('offline');}});
 assert.match(r.answer,/can’t retrieve verified NOAA/);
 assert.equal(r.citations.length,0);
});

test('validates question, chat and mode',()=>{assert.equal(validateQuestion({question:'Mars',chat_id:id}).question,'Mars');for(const value of [{question:'',chat_id:id},{question:'Mars',chat_id:'x'},{question:'Mars',chat_id:id,use_web:'true'}])assert.throws(()=>validateQuestion(value));});
test('forced web fails explicitly without key and never queries papers',async()=>{await assert.rejects(research({...input,useWeb:true},[],{env:{},lookupPapers:()=>assert.fail('paper fallback')}),/currently unavailable/);});
test('papers mode returns sourced short astronomy query',async()=>{const r=await research(input,[],{env:{GROQ_API_KEY:'test'},lookupPapers:async()=>[paper],fetcher:model('Mars has ice [1].')});assert.equal(r.confident,true);assert.equal(r.used_web,false);assert.equal(r.citations.length,1);});
test('invalid citations lower confidence',async()=>{const r=await research(input,[],{env:{GROQ_API_KEY:'test'},lookupPapers:async()=>[paper],fetcher:model('Mars [99]')});assert.equal(r.confident,false);assert.match(r.warnings[0],/could not be verified/);});
test('empty evidence never invokes model',async()=>{const r=await research(input,[],{env:{},lookupPapers:async()=>[],fetcher:()=>assert.fail('no model without evidence')});assert.equal(r.confident,false);});
test('web uses Tavily evidence and excludes unsafe URLs',async()=>{let calls=[];const r=await research({...input,useWeb:true},[],{env:{TAVILY_API_KEY:'test',GROQ_API_KEY:'test'},lookupPapers:()=>assert.fail(),fetcher:async(url,opts)=>{calls.push(url);return url.includes('tavily')?response({results:[{title:'Mars',url:'https://nasa.gov/mars',content:'Mars has polar ice'},{url:'javascript:alert(1)',content:'bad'}]}):model('Ice [1]')(url,opts);}});assert.equal(r.used_web,true);assert.equal(r.citations.length,1);assert.equal(calls.length,3);});
test('source failures remain visible',async()=>{const r=await research(input,[],{env:{},lookupPapers:async()=>{throw Error('fail')}});assert.match(r.warnings[0],/unavailable/);});
test('bounded JSON and unsafe URL checks',async()=>{assert.equal(safeURL('javascript:alert(1)'),null);await assert.rejects(bodyJSON(new Request('https://test',{method:'POST',body:'x'.repeat(30)}),10),/large/);});
function fixture({owner=true,quota=true,auth=true}={}){let external=0,saved;const client={auth:{getUser:async()=>({data:{user:auth?{id:'owner'}:null}})},from:()=>({select(){return this},eq(){return this},order(){return this},maybeSingle:async()=>({data:owner?{id}:null}),limit:async()=>({data:[]})}),rpc:async(name,args)=>{if(name==='consume_research_quota')return {data:quota};if(name==='match_papers_hybrid')return {data:[]};saved=args;return {data:1}}};return {handler:makeHandler({createClient:()=>client,env:{ALLOWED_ORIGINS:'https://app.test'},embed:async()=>[],fetcher:()=>external++}),external:()=>external,saved:()=>saved};}
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
test('stable preview preflight succeeds without granting other previews access',async()=>{
  const origin='https://spacemind-frontend-git-codex-tier2-citation-exports-syed-kamil.vercel.app';
  const handler=makeHandler({env:{},createClient:()=>assert.fail('preflight must not access Auth')});
  const response=await handler(new Request('https://test',{method:'OPTIONS',headers:{origin}}));
  assert.equal(response.status,204);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'),origin);
  for(const blocked of [origin+'.evil.test','https://unrelated.vercel.app','https://spacemind-frontend-git-untrusted-syed-kamil.vercel.app']){
    assert.equal((await handler(new Request('https://test',{method:'OPTIONS',headers:{origin:blocked}}))).status,403);
  }
  assert.equal((await handler(new Request('https://test',{method:'POST',headers:{origin}}))).status,401);
});
test('authenticated turn persists with warnings',async()=>{const f=fixture();assert.equal((await f.handler(request())).status,200);assert.deepEqual(f.saved().p_warnings,[]);});

test('casual shorthand answers directly in every mode without model or search',async()=>{
  for(const question of ['how r you','How are u?','hru','hello!','thanks bro','ok perfect thanks','okay, great, thank you','bye'])for(const useWeb of [null,false,true]){
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
  let calls=0,query;const r=await research({...input,question:'why does it have ice?',useWeb:null},[{question:'Tell me about Mars',answer:'Mars has polar ice.'}],{env:{GROQ_API_KEY:'test'},lookupPapers:async q=>{query=q;return [paper]},fetcher:async(url,opts)=>{
    if(++calls===1)return response({choices:[{message:{content:JSON.stringify({mode:'research',query:'Why does Mars have polar ice?'})}}]});
    return model('Mars has ice [1].')(url,opts);
  }});assert.match(query,/Mars/);assert.equal(calls,3);assert.equal(r.citations.length,1);assert.equal(r.confident,true);
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
test('missing configuration exposes no provider or key details',async()=>{
  await assert.rejects(groq([],{}),e=>{assert.equal(e.status,503);assert(!/key|groq|configured|backend/i.test(e.message));return true;});
});
test('source diagnostics stay out of user warnings',async()=>{
  const result=await research(input,[],{env:{GROQ_API_KEY:'test',SEMANTIC_SCHOLAR_API_KEY:'test'},lookupPapers:async()=>[paper],fetcher:async(url,opts)=>{if(url.includes('semanticscholar'))throw Error('private provider failure');return model('Mars has ice [1].')(url,opts);}});
  assert.equal(result.citations.length,1);assert.equal(result.warnings.length,1);assert(!/semantic|key|provider failure/i.test(result.warnings.join(' ')));
});

test('authenticated SSE delivers done only after successful persistence',async()=>{
 const f=fixture();const req=new Request('https://test',{method:'POST',headers:{authorization:'Bearer test',origin:'https://app.test',accept:'text/event-stream'},body:JSON.stringify({question:'hello',chat_id:id,stream:true})});
 const response=await f.handler(req);assert.match(response.headers.get('content-type'),/text\/event-stream/);const text=await response.text();assert.match(text,/event: status/);assert.match(text,/event: done/);assert.equal(f.saved().p_question,'hello');
});


test('auto mode forces basic astronomy questions into research and uses live web fallback',async()=>{
  let lookups=0,webCalls=0;
  const r=await research({...input,question:'What is the Sun?',useWeb:null},[],{
    env:{GROQ_API_KEY:'test'},
    lookupPapers:async()=>{lookups++;return [];},
    fetcher:async(url,opts)=>{
      if(url.includes('wikipedia.org/w/api.php')){webCalls++;return response({query:{pages:{'1':{pageid:1,index:1,title:'Sun',extract:'The Sun is the star at the centre of the Solar System.'}}}});}
      return model('The Sun is the star at the centre of the Solar System [1].')(url,opts);
    }
  });
  assert.equal(lookups,1);assert.equal(webCalls,1);assert.equal(r.used_web,true);
  assert.equal(r.citations[0].url,'https://en.wikipedia.org/?curid=1');
  assert.match(r.answer,/star/);
});
test('auto mode searches the web when paper results exist but have weak query coverage',async()=>{
  let webCalls=0;
  const r=await research({...input,question:'What is the Sun?',useWeb:null},[],{
    env:{GROQ_API_KEY:'test'},
    lookupPapers:async()=>[{...paper,snippet:'This paper studies Martian polar geology and dust deposition.'}],
    fetcher:async(url,opts)=>{
      if(url.includes('wikipedia.org/w/api.php')){webCalls++;return response({query:{pages:{'1':{pageid:2,index:1,title:'Sun',extract:'The Sun is a star made mostly of hydrogen and helium.'}}}});}
      return model('The Sun is a star [1].')(url,opts);
    }
  });
  assert.equal(webCalls,1);assert.equal(r.used_web,true);assert(r.citations.some(c=>c.origin==='web'));
});
test('live web search has a no-key Wikipedia fallback',async()=>{
  const {searchWeb}=await import('../../supabase/functions/_shared/research.js');
  let url='';
  const results=await searchWeb('What is the Sun?',{},async requestUrl=>{
    url=requestUrl;return response({query:{pages:{'1':{pageid:3,index:1,title:'Sun',extract:'The Sun is a star.'}}}});
  });
  assert.match(url,/wikipedia\\.org/);assert.equal(results.length,1);assert.equal(results[0].origin,'web');
});
