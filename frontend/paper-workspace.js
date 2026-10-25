import {mountProjects,chooseProjectForExecution} from './projects.js';
import {extractPaperPDF} from './pdf-extract.js';
import {getDocument,GlobalWorkerOptions,version} from 'pdfjs-dist';
GlobalWorkerOptions.workerSrc='/assets/pdf.worker.mjs';
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
const state={selected:[],task:'chat'};
const request=(path,body,method=body?'POST':'GET')=>window.SpaceMindBackend.request(path,{method,...(body?{body:JSON.stringify(body)}:{})});
const button=(title,fn)=>{const b=el('button',title,'secondary');b.type='button';b.onclick=async()=>{b.disabled=true;try{await fn();}catch(e){window.SpaceMindUI?.toast(e.message);}finally{b.disabled=false;}};return b;};
function link(url,title){try{const u=new URL(url);if(!['http:','https:'].includes(u.protocol))return el('span',title);const a=el('a',title);a.href=u.href;a.target='_blank';a.rel='noopener noreferrer';return a;}catch{return el('span',title);}}
export const extractPDF=(file,options={})=>extractPaperPDF(file,{...options,getDocument,parserVersion:version});
function selectedNotice(){const n=document.getElementById('paperSelection');if(n)n.textContent=state.selected.length?`${state.selected.length} selected paper(s) · ${state.task}. Clear selection to search all sources.`:'';}
async function saveSource(source){
 await request('/papers',{title:(source.title||source.source_file||'Research source').slice(0,500),metadata:source,pages:[{page:source.page||1,text:source.snippet||''}]});window.SpaceMindUI.toast('Saved to your papers.');
}
function graphView(source,groups){
 const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 760 420');svg.setAttribute('role','img');svg.setAttribute('aria-label','Citation network: references point outward, citing papers point inward, related papers have dashed links.');
 const add=(tag,attrs,text)=>{const n=document.createElementNS(ns,tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,String(v));if(text)n.textContent=text;svg.append(n);return n;};
 const center={x:380,y:205};const nodes=[];for(const [group,items]of Object.entries(groups)){const side=group==='References'?0:group==='Cited by'?1:2;items.slice(0,4).forEach((p,i)=>nodes.push({...p,group,x:side===0?135:side===1?625:100+i*185,y:side===2?365:55+i*78}));}
 for(const n of nodes){const incoming=n.group==='Cited by';const x1=incoming?n.x:center.x,y1=incoming?n.y:center.y,x2=incoming?center.x:n.x,y2=incoming?center.y:n.y;
  add('line',{x1,y1,x2,y2,stroke:n.group==='Related papers'?'#8596b3':'#b9a3ee','stroke-dasharray':n.group==='Related papers'?'5 4':'none','stroke-width':1.5});
  if(n.group!=='Related papers'){const angle=Math.atan2(y2-y1,x2-x1),x=x1+(x2-x1)*.66,y=y1+(y2-y1)*.66;add('path',{d:`M ${x-7*Math.cos(angle-.5)} ${y-7*Math.sin(angle-.5)} L ${x} ${y} L ${x-7*Math.cos(angle+.5)} ${y-7*Math.sin(angle+.5)}`,fill:'none',stroke:'#b9a3ee','stroke-width':2});}}
 for(const n of [...nodes,{...center,title:source.title||source.source_file||'Selected paper',group:'Selected paper'}]){add('rect',{x:n.x-83,y:n.y-21,width:166,height:42,rx:8,fill:n.group==='Selected paper'?'#382d54':'#121d2e',stroke:'#627391'});add('text',{x:n.x,y:n.y+4,'text-anchor':'middle',fill:'#e3e8f1','font-size':10},n.title.slice(0,27));}
 add('text',{x:135,y:18,fill:'#b9c6dc','text-anchor':'middle','font-size':12},'References');add('text',{x:625,y:18,fill:'#b9c6dc','text-anchor':'middle','font-size':12},'Cited by');add('text',{x:380,y:410,fill:'#b9c6dc','text-anchor':'middle','font-size':12},'Related papers (similarity, not a citation)');svg.style.width='100%';return svg;
}
async function graph(source){
 const id=source.arxiv_id?'ARXIV:'+source.arxiv_id:source.doi?'DOI:'+source.doi:source.paperId||null;
 if(!id)throw Error('This source has no supported paper identifier. Use Discover to find its record.');
 const d=dialog('Citation graph and related papers');d.body.textContent='Loading references, citations and related papers…';
 try{const result=await request('/discovery',{kind:'graph',paper_id:id});d.body.replaceChildren();
  d.body.append(graphView(source,result.groups));
  d.body.append(el('p','Links show the first 20 results per relationship; this is not a complete citation network.','notice'));
  for(const [group,items] of Object.entries(result.groups)){d.body.append(el('h3',group));renderPapers(d.body,items);}
  if(result.warnings.length)d.body.append(el('p',result.warnings.join(' '),'notice'));
 }catch(e){d.body.textContent=e.message;}
}
function dialog(title){const d=el('dialog',null,'research-dialog'),h=el('div',null,'dialog-heading'),body=el('div',null,'research-body');h.append(el('h2',title),button('Close',()=>d.close()));d.append(h,body);document.body.append(d);d.addEventListener('close',()=>d.remove());d.showModal();return {dialog:d,body};}
function renderPapers(host,items){if(!items.length)host.append(el('p','No records returned.'));for(const p of items){const card=el('article',null,'resource-card');card.append(link(p.url,p.title||'Paper'),el('p',[p.year,(p.authors||[]).join(', ')].filter(Boolean).join(' · ')),el('p',p.snippet||''),button('Save paper',()=>saveSource(p)),button('Citations / related',()=>graph(p)));host.append(card);}}
async function viewPaper(id){
 const d=dialog('Saved paper · extracted text');d.body.textContent='Loading saved text…';
 try{const p=await request('/papers/'+id);if(!d.dialog.open)return;d.body.replaceChildren();
  d.body.append(el('h3',p.title),el('p','Extracted text may lose mathematical symbols, reading order and table columns. Compare it with the original PDF before citing.','notice'));
  if(p.metadata?.url)d.body.append(link(p.metadata.url,'Open original source ↗'));
  const pages=Array.isArray(p.pages)?p.pages:[],choose=el('select'),text=el('pre',null,'paper-extracted-text');choose.setAttribute('aria-label','Extracted page');
  pages.forEach((page,i)=>{const option=el('option',p.metadata?.origin==='uploaded_pdf'?`Page ${page.page}`:`Saved excerpt ${i+1}`);option.value=i;choose.append(option);});
  choose.onchange=()=>text.textContent=pages[Number(choose.value)]?.text||'No text extracted on this page.';
  d.body.append(choose,text);choose.onchange();
 }catch(e){d.body.textContent=e.message;}
}
async function open(){
 if(!window.SpaceMindBackend)throw Error('The paper workspace requires the hosted account service.');
 const d=dialog('Your research library'),nav=el('div',null,'science-actions'),content=el('div');
 d.body.append(nav,content);
 d.dialog.addEventListener('cancel',e=>{if(hasUnsavedNotes()&&!confirm('Discard unsaved paper notes or collection changes?'))e.preventDefault();});
 d.dialog.querySelector('.dialog-heading button').onclick=()=>{if(!hasUnsavedNotes()||confirm('Discard unsaved paper notes or collection changes?'))d.dialog.close();};
 let viewVersion=0;const hasUnsavedNotes=()=>[...content.querySelectorAll('[data-saved]')].some(n=>n.value!==n.dataset.saved);
 async function show(tab){if(hasUnsavedNotes()&&!confirm('Discard unsaved paper notes or collection changes?'))return;const version=++viewVersion;content.replaceChildren(el('p','Loading…'));
 try{
 if(tab==='projects'){await mountProjects(content,{readPaper:viewPaper,openChat:async id=>{if(hasUnsavedNotes()&&!confirm('Discard unsaved project notes?'))return;await window.SpaceMindUI.openChat(id);d.dialog.close();}});
 }else if(tab==='papers'){
  const [papers,collections]=await Promise.all([request('/papers'),request('/collections')]);if(version!==viewVersion)return;content.replaceChildren();
  const upload=el('input');upload.type='file';upload.accept='.pdf,application/pdf';upload.setAttribute('aria-label','Upload a paper PDF');
  const status=el('p',null,'notice');status.setAttribute('role','status');
  const progress=el('progress');progress.hidden=true;progress.setAttribute('aria-label','PDF extraction progress');
  let uploadController;const cancelUpload=button('Cancel reading',()=>uploadController?.abort());cancelUpload.hidden=true;
  d.dialog.addEventListener('close',()=>uploadController?.abort(),{once:true});
  upload.onchange=async()=>{
   if(!upload.files[0])return;upload.disabled=true;uploadController=new AbortController();cancelUpload.hidden=false;progress.hidden=false;
   try{
    const paper=await extractPDF(upload.files[0],{signal:uploadController.signal,onProgress:p=>{status.textContent=p.total?`Reading page ${p.page} of ${p.total}…`:'Reading PDF…';if(p.total){progress.max=p.total;progress.value=p.page;}}});
    if(version!==viewVersion||!d.dialog.open)return;
    const duplicate=papers.find(p=>p.metadata?.content_sha256===paper.metadata.content_sha256);
    if(duplicate){status.textContent=`This exact PDF is already saved as “${duplicate.title}”. Its notes and collection were preserved.`;return;}
    cancelUpload.hidden=true;status.textContent='Saving extracted text privately…';
    await request('/papers',paper);if(version===viewVersion&&d.dialog.open)await show('papers');
   }catch(e){if(version===viewVersion)status.textContent=e.name==='AbortError'?'PDF reading cancelled. Nothing was saved.':e.message;}
   finally{upload.disabled=false;cancelUpload.hidden=true;progress.hidden=true;upload.value='';}
  };
  content.append(upload,el('p','PDF text is saved privately to your account. Up to 20 MB / 100 pages; scanned pages need OCR. Check equations and table layout against the original.','science-note'),status,progress,cancelUpload);
  const collection=el('input');collection.placeholder='New collection name';collection.maxLength=100;collection.setAttribute('aria-label','New collection name');
  content.append(collection,button('Create collection',async()=>{if(!collection.value.trim())return;await request('/collections',{name:collection.value.trim()});await show('papers');}));
  const filter=el('select');filter.setAttribute('aria-label','Filter by collection');const all=el('option','All papers');all.value='';filter.append(all);for(const c of collections){const o=el('option',c.name);o.value=c.id;filter.append(o);}content.append(filter);
  const tasks=el('select');tasks.setAttribute('aria-label','Paper research task');for(const [value,name]of Object.entries({chat:'Chat with selection',summary:'Summarize',compare:'Compare papers',literature:'Literature review',problems:'Open problems',equations:'Extract equations',tables:'Extract tables'})){const o=el('option',name);o.value=value;tasks.append(o);}tasks.value=state.task;
  content.append(tasks,button('Use selected papers',()=>{if(!state.selected.length)throw Error('Select at least one paper.');if(tasks.value==='compare'&&state.selected.length<2)throw Error('Select two papers to compare.');state.task=tasks.value;selectedNotice();d.dialog.close();window.SpaceMindUI.prepare(`Please ${tasks.options[tasks.selectedIndex].text.toLowerCase()} using my selected papers.`);}),button('Clear selection',()=>{state.selected=[];state.task='chat';selectedNotice();show('papers');}));
  const list=el('div');content.append(list);
  function draw(){list.replaceChildren();for(const p of papers.filter(p=>!filter.value||p.collection_id===filter.value)){
   const card=el('article',null,'resource-card'),label=el('label'),check=el('input');check.type='checkbox';check.checked=state.selected.includes(p.id);check.onchange=()=>{if(check.checked&&state.selected.length>=6){check.checked=false;return window.SpaceMindUI.toast('Select up to six papers.');}state.selected=check.checked?[...state.selected,p.id]:state.selected.filter(x=>x!==p.id);selectedNotice();};label.append(check,document.createTextNode(p.title));
   const move=el('select');move.setAttribute('aria-label','Collection for '+p.title);const none=el('option','Unfiled');none.value='';move.append(none);collections.forEach(c=>{const o=el('option',c.name);o.value=c.id;move.append(o);});move.value=p.collection_id||'';
   const notes=el('textarea');notes.value=p.notes;notes.maxLength=20000;notes.placeholder='Notes for this paper';notes.setAttribute('aria-label','Notes for '+p.title);
   notes.dataset.saved=notes.value;move.dataset.saved=move.value;
   const limits=el('p',(p.metadata?.extraction_warnings||[]).join(' '),'notice');
   card.append(label,limits,move,notes,button('Read extracted text',()=>viewPaper(p.id)),button('Export BibTeX',()=>window.SpaceMindCitations.download([{...p.metadata,title:p.title,doc_id:p.id}],'bibtex')),button('Export APA',()=>window.SpaceMindCitations.download([{...p.metadata,title:p.title,doc_id:p.id}],'apa')),button('Save notes / collection',async()=>{await request('/papers/'+p.id,{notes:notes.value,collection_id:move.value},'PATCH');notes.dataset.saved=notes.value;move.dataset.saved=move.value;window.SpaceMindUI.toast('Saved.');}),button('Citations / related',()=>graph(p.metadata)),button('Delete paper',async()=>{if(!confirm('Delete this saved paper and its notes?'))return;await request('/papers/'+p.id,undefined,'DELETE');state.selected=state.selected.filter(x=>x!==p.id);selectedNotice();await show('papers');}));list.append(card);
  }if(!papers.length)list.append(el('p','Upload a PDF or save a source from a research answer.'));}filter.onchange=()=>{if(hasUnsavedNotes()&&!confirm('Discard unsaved paper edits?'))return;draw();};draw();
 }else if(tab==='discover'){
  content.replaceChildren();const form=el('form'),q=el('input'),provider=el('select'),results=el('div');q.placeholder='Search astronomy papers';q.required=true;q.maxLength=100;q.setAttribute('aria-label','Paper search');for(const [v,t]of [['scholar','Semantic Scholar'],['ads','NASA ADS']]){const o=el('option',t);o.value=v;provider.append(o);}provider.setAttribute('aria-label','Paper archive');const submit=el('button','Search','primary');form.append(q,provider,submit);content.append(form,results);form.onsubmit=async e=>{e.preventDefault();submit.disabled=true;results.textContent='Searching…';try{const data=await request('/discovery',{kind:provider.value,query:q.value});results.replaceChildren();for(const warning of data.warnings||[])results.append(el('p',warning,'notice'));renderPapers(results,data.papers);}catch(e){results.textContent=e.message;}finally{submit.disabled=false;}};
 }else{
  const [topics,alerts]=await Promise.all([request('/topics'),request('/alerts')]);if(version!==viewVersion)return;content.replaceChildren();content.append(el('p','Follow a topic for daily in-app alerts from newly imported arXiv abstracts. New subscriptions start with future imports.','notice'));const input=el('input');input.placeholder='e.g. exoplanet atmosphere';input.maxLength=100;input.setAttribute('aria-label','Topic to follow');content.append(input,button('Follow topic',async()=>{if(input.value.trim().length<2)return;await request('/topics',{topic:input.value.trim()});await show('digest');}));for(const t of topics)content.append(button('Unfollow '+t.topic,async()=>{await request('/topics/'+t.id,undefined,'DELETE');await show('digest');}));for(const a of alerts){const row=el('article',null,'resource-card');row.append(link(a.url,a.title),el('p',a.created_at),button(a.seen?'Read':'Mark read',async()=>{await request('/alerts/'+a.id,{seen:true},'PATCH');await show('digest');}));content.append(row);}if(!alerts.length)content.append(el('p','No new-paper alerts yet.'));
 }
 }catch(e){if(version===viewVersion)content.textContent=e.message;}}
 for(const [key,label]of [['papers','My papers'],['discover','Discover'],['digest','Daily digest'],['projects','Projects']])nav.append(button(label,()=>show(key)));await show('papers');
}
window.SpaceMindPapers={saveExecution:chooseProjectForExecution,open,saveSource,graph,selection:()=>({paper_ids:[...state.selected],paper_task:state.task}),reset:()=>{state.selected=[];state.task='chat';selectedNotice();}};
