import {createClient} from 'npm:@supabase/supabase-js@2.117.2';
import {makeHandler} from './handler.js';
Deno.serve(makeHandler({createClient,env:Deno.env.toObject()}));
