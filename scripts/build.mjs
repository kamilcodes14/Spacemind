import {build} from 'esbuild';
import {mkdir,rm,readFile,writeFile,copyFile} from 'node:fs/promises';
const url=process.env.SUPABASE_URL?.replace(/\/$/,'');
const key=process.env.SUPABASE_PUBLISHABLE_KEY||process.env.SUPABASE_ANON_KEY;
if(!url||!key) throw new Error('Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY (or SUPABASE_ANON_KEY) before building.');
const parsed=new URL(url);
if(parsed.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(parsed.hostname)) throw new Error('Supabase must use HTTPS outside local development.');
if(!key.startsWith('sb_publishable_')){
  let role;try{role=JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString()).role;}catch{}
  if(role!=='anon') throw new Error('Only a publishable or legacy anon key belongs in the frontend. Never use a service-role/secret key.');
}
await rm('dist',{recursive:true,force:true});await mkdir('dist/assets',{recursive:true});
for(const name of ['app.js','styles.css','logo.png','logo.mp4'])await copyFile('frontend/'+name,'dist/assets/'+name);
await build({entryPoints:['frontend/universe.js'],bundle:true,format:'iife',platform:'browser',target:'es2022',minify:true,outfile:'dist/assets/universe.js'});
const frameBuild=await build({entryPoints:['frontend/science/python-frame.js'],bundle:true,format:'iife',platform:'browser',target:'es2022',minify:true,write:false,plugins:[{name:'worker-text',setup(b){b.onResolve({filter:/\?text$/},args=>({path:new URL('../frontend/science/'+args.path.replace('./','').replace('?text',''),import.meta.url).pathname,namespace:'worker-text'}));b.onLoad({filter:/.*/,namespace:'worker-text'},async args=>({contents:await readFile(args.path,'utf8'),loader:'text'}));}}]});
const frameHTML=`<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'wasm-unsafe-eval' https://cdn.jsdelivr.net; worker-src blob:; connect-src https://cdn.jsdelivr.net https://pypi.org https://files.pythonhosted.org; img-src data:; style-src 'none'; form-action 'none'; base-uri 'none'"><script>${frameBuild.outputFiles[0].text.replaceAll('</script','<\\/script')}</script>`;
await build({entryPoints:['frontend/science/lab.js'],bundle:true,format:'iife',platform:'browser',target:'es2022',minify:true,outfile:'dist/assets/science.js',define:{__PYTHON_FRAME__:JSON.stringify(frameHTML)}});
await copyFile('frontend/science/styles.css','dist/assets/science.css');
await copyFile('data/learning_paths.json','dist/assets/learning_paths.json');
await build({entryPoints:['frontend/supabase-backend.js'],bundle:true,format:'iife',platform:'browser',target:'es2022',minify:true,outfile:'dist/assets/backend.js',define:{__SUPABASE_URL__:JSON.stringify(url),__SUPABASE_KEY__:JSON.stringify(key)}});
let html=await readFile('frontend/index.html','utf8');
html=html.replace('<script src="/assets/universe.js"', '<script src="/assets/backend.js" defer></script>\n<script src="/assets/universe.js"');
await writeFile('dist/index.html',html);
console.log('Built static frontend in dist/. Research requests go directly to Supabase.');
