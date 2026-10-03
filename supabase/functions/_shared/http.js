export class HttpError extends Error {constructor(status,message){super(message);this.status=status;}}
export function cors(req,allowed){
  const origin=req.headers.get('origin');
  // This repository's deployed frontend must work without a separate origin secret.
  // ALLOWED_ORIGINS can add development or custom domains; never allow all origins.
  const allow=['https://spacemind-frontend.vercel.app',...allowed.split(',').map(s=>s.trim().replace(/\/$/,'')).filter(Boolean)];
  if(origin&&!allow.includes(origin))throw new HttpError(403,'This website is not allowed to call the research backend.');
  return {'Access-Control-Allow-Origin':origin||allow[0]||'null','Access-Control-Allow-Headers':'authorization,x-client-info,apikey,content-type','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Vary':'Origin','Cache-Control':'no-store'};
}
export function json(data,status=200,headers={}){return new Response(JSON.stringify(data),{status,headers:{...headers,'Content-Type':'application/json'}});}
export async function bodyJSON(req,maxBytes=20000){
  if(Number(req.headers.get('content-length')||0)>maxBytes)throw new HttpError(413,'Request too large.');
  // Bound the streamed body as well: Content-Length is optional and untrusted.
  const reader=req.body?.getReader();if(!reader)throw new HttpError(400,'A JSON body is required.');
  let size=0;const parts=[];
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>maxBytes){await reader.cancel();throw new HttpError(413,'Request too large.');}parts.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.length;}
  try{const data=JSON.parse(new TextDecoder().decode(bytes));if(!data||Array.isArray(data)||typeof data!=='object')throw Error();return data;}
  catch{throw new HttpError(400,'A valid JSON object is required.');}
}
export async function authenticate(req,createClient,env){
  const authorization=req.headers.get('authorization');
  if(!authorization?.startsWith('Bearer '))throw new HttpError(401,'Please sign in to continue.');
  const token=authorization.slice(7);
  const client=createClient(env.SUPABASE_URL,env.SUPABASE_ANON_KEY,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await client.auth.getUser(token);
  if(error||!data?.user||data.user.is_anonymous)throw new HttpError(401,'Please sign in to continue.');
  return {client,user:data.user};
}
export function safeURL(value){try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)?u.href:null;}catch{return null;}}
export async function fetchJSON(url,options={},fetcher=fetch,timeout=15000){
  let response;try{response=await fetcher(url,{...options,signal:AbortSignal.timeout(timeout)});}catch{throw new HttpError(503,'A research provider did not respond. Please try again.');}
  if(!response.ok)throw new HttpError(response.status===429?429:503,'A research provider is unavailable or rate limited. Please try again.');
  return response.json();
}
