import workerSource from './python-worker.js?text';
let worker,port,busy=false,timer;
function stop(){clearTimeout(timer);worker?.terminate();worker=null;busy=false;}
function send(m){port?.postMessage(m);}
function getWorker(){
 if(worker)return worker;
 const url=URL.createObjectURL(new Blob([workerSource],{type:'text/javascript'}));worker=new Worker(url);URL.revokeObjectURL(url);
 worker.onmessage=e=>{const m=e.data;if(['done','error'].includes(m.type)){clearTimeout(timer);busy=false;}send(m);};
 worker.onerror=()=>{stop();send({type:'error',text:'The Python runtime could not start. Check your connection and try resetting it.'});};return worker;
}
addEventListener('message',e=>{
 if(e.source!==parent||e.data?.type!=='connect-python'||port||!e.ports[0])return;
 port=e.ports[0];port.onmessage=event=>{
  const m=event.data;if(m.type==='stop'){stop();send({type:'done',text:'Stopped. Runtime and uploaded files cleared.'});return;}
  if(busy){send({type:'error',text:'A calculation is already running.'});return;}
  busy=true;timer=setTimeout(()=>{stop();send({type:'error',text:'Execution stopped after 120 seconds. Narrow the calculation and try again.'});},120000);
  getWorker().postMessage(m,m.bytes?[m.bytes]:[]);
 };send({type:'ready'});
});
