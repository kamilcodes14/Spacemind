import {modelCandidates,completionBody} from './models.js';
import {HttpError} from './http.js';

// Yield complete SSE frames across arbitrary UTF-8 and network boundaries.
export async function* sseEvents(body){
  const reader=body.getReader(),decoder=new TextDecoder();let buffer='';
  try{while(true){const {done,value}=await reader.read();buffer+=done?decoder.decode():decoder.decode(value,{stream:true});buffer=buffer.replace(/\r\n/g,'\n');let end;while((end=buffer.indexOf('\n\n'))>=0){const frame=buffer.slice(0,end);buffer=buffer.slice(end+2);const data=frame.split('\n').filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n');if(data)yield data;}if(buffer.length>200000)throw Error('Oversized stream frame');if(done)break;}}
  finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}

// Extract only the answer string from an incrementally received JSON object.
// Never publish reasoning, follow-ups, or incomplete JSON escape sequences.
export function partialAnswer(json){
  const match=/"answer"\s*:\s*"/.exec(json);if(!match)return '';
  let raw='';
  for(let i=match.index+match[0].length;i<json.length;i++){
    const ch=json[i];if(ch==='"')break;
    if(ch==='\\'){
      if(i+1>=json.length)break;
      if(json[i+1]==='u'){if(i+5>=json.length)break;raw+=json.slice(i,i+6);i+=5;}
      else{raw+=json.slice(i,i+2);i++;}
    }else raw+=ch;
  }
  try{return JSON.parse('"'+raw+'"');}catch{return '';}
}
export async function streamCompletion(messages,env,fetcher,onDelta){
  let response,candidate;
  for(const next of modelCandidates(env)){
    try{response=await fetcher(next.url,{method:'POST',headers:{Authorization:`Bearer ${next.key}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(60000),body:JSON.stringify(completionBody(next,messages,{jsonMode:true,maxTokens:8192,stream:true}))});}
    catch{continue;}
    if(response.ok&&response.body){candidate=next;break;}
    await response.body?.cancel().catch(()=>{});
  }
  if(!candidate)throw new HttpError(503,'Replies are temporarily unavailable. Please try again.');
  let text='',emitted='',finish=null,ended=false;
  for await(const data of sseEvents(response.body)){
    if(data==='[DONE]'){ended=true;break;}
    const frame=JSON.parse(data);if(frame.error)throw Error('Stream provider failed');
    const choice=frame.choices?.[0];if(choice?.finish_reason)finish=choice.finish_reason;
    if(typeof choice?.delta?.content==='string')text+=choice.delta.content;
    if(text.length>70000)throw Error('Answer too long');
    const next=partialAnswer(text);if(next.startsWith(emitted)&&next.length>emitted.length){onDelta(next.slice(emitted.length));emitted=next;}
  }
  if(!ended||finish!=='stop')throw new HttpError(503,'The answer was interrupted. Please try again.');
  JSON.parse(text);env.onModel?.(candidate.model);return text;
}
