import {createClient} from 'npm:@supabase/supabase-js@2.117.2';
import {makeHandler} from './handler.js';
// Supabase Edge Runtime provides this inference API; no remote embedding key is needed.
declare const Supabase: {ai:{Session:new (model:string)=>{run:(text:string,options:object)=>Promise<number[]>}}};
let model:InstanceType<typeof Supabase.ai.Session>;
const handler=makeHandler({createClient,env:Deno.env.toObject(),embed:async(text:string)=>{
 model??=new Supabase.ai.Session('gte-small');
 return await model.run(text,{mean_pool:true,normalize:true});
}});
Deno.serve(handler);
