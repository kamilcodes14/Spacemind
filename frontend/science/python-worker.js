/* Runs only inside an opaque-origin iframe; never in the authenticated app origin. */
let runtime;
let outputSize=0;
let outputTruncated=false;
const emit=(type,text)=>{if(type==='stdout'||type==='stderr'){outputSize+=text.length;if(outputSize>50000){outputTruncated=true;return;}}postMessage({type,text});};
async function initialize(){
 if(runtime)return runtime;
 importScripts('https://cdn.jsdelivr.net/pyodide/v314.0.7/full/pyodide.js');
 runtime=await loadPyodide({indexURL:'https://cdn.jsdelivr.net/pyodide/v314.0.7/full/',stdout:s=>emit('stdout',s),stderr:s=>emit('stderr',s)});
 await runtime.loadPackage(['numpy','scipy','astropy','micropip','matplotlib']);
 runtime.FS.mkdirTree('/work');runtime.FS.chdir('/work');
 await runtime.runPythonAsync("import matplotlib\nmatplotlib.use('Agg')\nfrom astropy.utils import iers\niers.conf.auto_download = False");
 emit('status','Python ready · NumPy, SciPy, Astropy, Matplotlib');return runtime;
}
onmessage=async e=>{
 const m=e.data;outputSize=0;outputTruncated=false;
 try{
  emit('status','Loading scientific Python…');const py=await initialize();
  if(m.type==='upload'){
   if(!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,120}$/.test(m.name)||m.bytes.byteLength>64*1024*1024)throw Error('Use a simple filename and a file smaller than 64 MB.');
   py.FS.writeFile('/work/'+m.name,new Uint8Array(m.bytes));emit('done','Uploaded '+m.name+' to /work');return;
  }
  if(m.type==='install'){
   // Exact versions and a fixed allowlist; no arbitrary package command from the host.
   const packages={skyfield:['sgp4==2.27','jplephem==2.24','skyfield==1.55'],spiceypy:['spiceypy==8.2.0']};
   if(!packages[m.name])throw Error('Unsupported optional package.');
   py.globals.set('_packages',packages[m.name]);await py.runPythonAsync('import micropip\nawait micropip.install(_packages.to_py())');py.globals.delete('_packages');
   await py.runPythonAsync(m.name==='skyfield'?'from skyfield.api import load\nprint("Skyfield ready")':'import spiceypy\nprint("SPICE",spiceypy.tkvrsn("TOOLKIT"))');emit('done',m.name+' ready');return;
  }
  if(m.type!=='run'||typeof m.code!=='string'||m.code.length>30000)throw Error('Invalid Python request.');
  if(/\b(import spiceypy|from spiceypy)\b/.test(m.code)){
   await py.runPythonAsync('import micropip\nawait micropip.install("spiceypy==8.2.0")');
  }
  emit('status','Executing Python…');const started=performance.now();
  await py.runPythonAsync("import matplotlib.pyplot as plt\nplt.close('all')");
  const inputs=[];let embeddedBytes=0;
  for(const name of py.FS.readdir('/work').filter(n=>n!=='.'&&n!=='..')){
   const stat=py.FS.stat('/work/'+name);if(!py.FS.isFile(stat.mode))continue;
   const bytes=py.FS.readFile('/work/'+name);
   const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
   const item={name,size_bytes:bytes.length,sha256};
   if(m.includeInputs&&embeddedBytes+bytes.length<=16*1024*1024){let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));item.base64=btoa(binary);embeddedBytes+=bytes.length;}
   else item.omitted_reason=m.includeInputs?'16 MB bundle input limit':'Input inclusion not selected';
   inputs.push(item);
  }
  const versions=await py.runPythonAsync("import sys, json, importlib.metadata as md\njson.dumps({'python':sys.version, 'packages':{d.metadata['Name']:d.version for d in md.distributions()}})");
  postMessage({type:'provenance',text:JSON.stringify({inputs,environment:JSON.parse(versions),runtime:'Pyodide 314.0.7',started_at:new Date().toISOString()})});
  // Fresh namespace per run. Uploaded files and installed packages survive until reset.
  const globals=py.toPy({});try{
   await py.runPythonAsync(m.code,{globals});
   const rows=globals.get('result_rows');if(rows){try{const raw=rows.toJs({dict_converter:Object.fromEntries});const encoded=JSON.stringify(raw);if(encoded.length<=2_000_000&&Array.isArray(raw)&&raw.length<=20000)postMessage({type:'table',text:encoded});}finally{rows.destroy?.();}}
  }finally{globals.destroy();}
  const figures=await py.runPythonAsync("import io, base64, matplotlib.pyplot as plt\n_images=[]\nfor n in plt.get_fignums()[:4]:\n    _buf=io.BytesIO()\n    plt.figure(n).savefig(_buf,format='png',dpi=100,bbox_inches='tight')\n    _images.append(base64.b64encode(_buf.getvalue()).decode())\nplt.close('all')\n_images");
  for(const data of figures.toJs())if(data.length<3_000_000)postMessage({type:'image',text:data});figures.destroy();
  postMessage({type:'execution-limits',text:JSON.stringify({stdout_truncated:outputTruncated,plots_limit:4,table_limit_rows:20000})});
  emit('done',`Executed in ${((performance.now()-started)/1000).toFixed(2)} s. Numerical checks, when present, are shown above.`);
 }catch(e){emit('error',String(e.message||e).slice(-6000));}
};
