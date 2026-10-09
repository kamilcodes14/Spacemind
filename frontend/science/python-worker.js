/* Runs only inside an opaque-origin iframe; never in the authenticated app origin. */
let runtime;
let outputSize=0;
const emit=(type,text)=>{if(type==='stdout'||type==='stderr'){outputSize+=text.length;if(outputSize>50000)return;}postMessage({type,text});};
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
 const m=e.data;outputSize=0;
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
  // Fresh namespace per run. Uploaded files and installed packages survive until reset.
  const globals=py.toPy({});try{await py.runPythonAsync(m.code,{globals});}finally{globals.destroy();}
  const figures=await py.runPythonAsync("import io, base64, matplotlib.pyplot as plt\n_images=[]\nfor n in plt.get_fignums()[:4]:\n    _buf=io.BytesIO()\n    plt.figure(n).savefig(_buf,format='png',dpi=100,bbox_inches='tight')\n    _images.append(base64.b64encode(_buf.getvalue()).decode())\nplt.close('all')\n_images");
  for(const data of figures.toJs())if(data.length<3_000_000)postMessage({type:'image',text:data});figures.destroy();
  emit('done',`Executed in ${((performance.now()-started)/1000).toFixed(2)} s. Numerical checks, when present, are shown above.`);
 }catch(e){emit('error',String(e.message||e).slice(-6000));}
};
