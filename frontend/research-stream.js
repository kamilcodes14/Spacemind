// The final done event is authoritative: draft tokens are never treated as saved
// or verified, and a disconnected stream fails instead of returning partial text.
export async function readResearchStream(response,onEvent){
  if(!response.ok){const data=await response.json().catch(()=>({}));const e=new Error(data.detail||'Research is unavailable. Please try again.');e.status=response.status;throw e;}
  if(!response.headers.get('content-type')?.includes('text/event-stream'))return response.json();
  const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',result;
  try{while(true){const {done,value}=await reader.read();buffer+=done?decoder.decode():decoder.decode(value,{stream:true});buffer=buffer.replace(/\r\n/g,'\n');let end;
    while((end=buffer.indexOf('\n\n'))>=0){const frame=buffer.slice(0,end);buffer=buffer.slice(end+2);const lines=frame.split('\n');const event=lines.find(l=>l.startsWith('event:'))?.slice(6).trim();const data=lines.filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n');if(!data)continue;const payload=JSON.parse(data);if(event==='error')throw new Error(payload.detail||'Research was interrupted.');if(event==='done')result=payload;else onEvent?.(event,payload);}
    if(buffer.length>2000000)throw new Error('The response was too large.');if(done)break;
  }}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
  if(!result)throw new Error('The response was interrupted before it could be saved. Please try again.');return result;
}
