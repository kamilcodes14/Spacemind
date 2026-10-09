import {authenticate,bodyJSON,cors,HttpError,json} from '../_shared/http.js';
import {research,validateQuestion} from '../_shared/research.js';
export function makeHandler({createClient,env,embed,fetcher=fetch}){
 return async req=>{
  let headers={};try{
    headers=cors(req,env.ALLOWED_ORIGINS||'');
    if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
    if(!['GET','POST'].includes(req.method))throw new HttpError(405,'Method not allowed.');
    const {client,user}=await authenticate(req,createClient,env);
    if(req.method==='GET')return json({web_search:!!env.TAVILY_API_KEY,semantic_scholar:!!env.SEMANTIC_SCHOLAR_API_KEY},200,headers);
    const body=await bodyJSON(req);const input=validateQuestion(body);
    const streaming=body.stream===true&&req.headers.get('accept')?.includes('text/event-stream');
    const {data:chat,error:chatError}=await client.from('chats').select('id').eq('id',input.chatId).eq('user_id',user.id).maybeSingle();
    if(chatError)throw new HttpError(503,'Conversation storage is unavailable.');
    if(!chat)throw new HttpError(404,'Conversation not found.');
    const quota=await client.rpc('consume_research_quota');
    if(quota.error)throw new HttpError(503,'Research limits could not be checked.');
    if(quota.data!==true)throw new HttpError(429,'You have reached 30 research requests this hour. Please try again later.');
    const previous=await client.from('messages').select('question,answer').eq('chat_id',input.chatId).order('id',{ascending:false}).limit(10);
    if(previous.error)throw new HttpError(503,'Conversation history is unavailable.');
    const lookupPapers=async query=>{
      let vector=null;try{vector=await embed(query.slice(0,2000));}catch{/* Full-text retrieval remains available if inference is temporarily unavailable. */}
      const matched=await client.rpc('match_papers_hybrid',{query_embedding:vector,query_text:query,match_count:24});
      if(matched.error)throw new Error('Paper lookup failed');
      return (matched.data||[]).map(p=>({source_file:p.title,origin:p.origin,url:p.url,snippet:p.content.slice(0,6000),title:p.title,authors:p.authors||[],year:p.year,arxiv_id:p.arxiv_id,doc_id:p.doc_id,score:p.score}));
    };
    const run=async onEvent=>{
      const result=await research(input,(previous.data||[]).reverse(),{env,fetcher,lookupPapers,onEvent});
      const saved=await client.rpc('save_research_turn',{p_chat_id:input.chatId,p_question:input.question,p_answer:result.answer,p_citations:result.citations,p_follow_ups:result.follow_up_questions,p_confident:result.confident,p_used_web:result.used_web,p_warnings:result.warnings});
      if(saved.error)throw new HttpError(409,'The answer could not be saved. The conversation may have been deleted.');
      return result;
    };
    if(!streaming)return json(await run(),200,headers);
    const encoder=new TextEncoder();let cancelled=false;
    const stream=new ReadableStream({
      async start(controller){
        const send=(event,data)=>{if(!cancelled)controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));};
        const heartbeat=setInterval(()=>{if(!cancelled)controller.enqueue(encoder.encode(': keepalive\n\n'));},10000);
        try{send('status',{stage:'starting',message:'Starting research…'});const result=await run(send);send('done',result);}
        catch(error){send('error',{detail:error instanceof HttpError?error.message:'Research could not complete. Please try again.'});}
        finally{clearInterval(heartbeat);if(!cancelled)controller.close();}
      },
      cancel(){cancelled=true;}
    });
    return new Response(stream,{headers:{...headers,'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform','X-Accel-Buffering':'no'}});
  }catch(error){return json({detail:error instanceof HttpError?error.message:'Research could not complete. Please try again.'},error instanceof HttpError?error.status:503,headers);}
 };
}
