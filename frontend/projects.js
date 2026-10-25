import {downloadArtifact} from './science/notebook.js';
const request=(path,body,method=body?'POST':'GET')=>window.SpaceMindBackend.request(path,{method,...(body?{body:JSON.stringify(body)}:{})});
const el=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};
function button(label,fn){const b=el('button',label);b.type='button';b.className='secondary';b.onclick=async()=>{b.disabled=true;try{await fn();}catch(e){window.SpaceMindUI.toast(e.message);}finally{b.disabled=false;}};return b;}
export function executionSnapshot(execution){
 if(!execution?.completed_at||typeof execution.code!=='string'||typeof execution.output!=='string')throw Error('Run a calculation successfully first.');
 // Uploaded bytes and plots remain in the downloadable bundle; never silently save them to the account.
 const snapshot={code:execution.code,output:execution.output,completed_at:execution.completed_at,context:execution.context,environment:execution.environment,runtime:execution.runtime,limits:execution.limits,inputs:(execution.inputs||[]).map(({base64,...metadata})=>metadata)};
 if(new TextEncoder().encode(JSON.stringify(snapshot)).length>=180000)throw Error('Calculation is too large to save. Export its reproducibility bundle instead.');
 return snapshot;
}
export async function chooseProjectForExecution(execution){
 const account=window.SpaceMindUI.accountId(),snapshot=executionSnapshot(execution),projects=await request('/projects');
 if(!account||window.SpaceMindUI.accountId()!==account)return;
 if(!projects.length)throw Error('Create a project in Library → Projects first.');
 const dialog=el('dialog');dialog.className='research-dialog';const body=el('div');body.className='research-body';const select=el('select');select.setAttribute('aria-label','Project for calculation');
 for(const p of projects){const o=el('option',p.name);o.value=p.id;select.append(o);}
 body.append(el('h2','Save calculation to project'),el('p','Saves executed code, text output and provenance privately. Input bytes and plots stay in your download.'),select,button('Save',async()=>{await request('/project-items',{project_id:select.value,title:(snapshot.context?.kind||'Python')+' · '+snapshot.completed_at,execution:snapshot});dialog.close();window.SpaceMindUI.toast('Calculation saved.');}),button('Cancel',()=>dialog.close()));
 dialog.append(body);dialog.addEventListener('close',()=>dialog.remove());document.body.append(dialog);dialog.showModal();
}
export async function mountProjects(host,{readPaper,openChat}){
 host.textContent='Loading projects…';const projects=await request('/projects');if(!host.isConnected)return;host.replaceChildren();
 const name=el('input');name.maxLength=100;name.placeholder='Project name';name.setAttribute('aria-label','New project name');
 host.append(el('p','Link papers, conversations, notes and completed calculations. Deleting a project removes its links and saved calculation copies; original papers and chats remain.'),name,button('Create project',async()=>{if(!name.value.trim())return;await request('/projects',{name:name.value.trim()});await mountProjects(host,{readPaper,openChat});}));
 for(const p of projects)host.append(button(p.name,()=>detail(p.id)));
 if(!projects.length)host.append(el('p','No projects yet.'));
 const content=el('section');host.append(content);let detailVersion=0;
 async function detail(id){
  if([...content.querySelectorAll('[data-saved]')].some(n=>n.value!==n.dataset.saved)&&!confirm('Discard unsaved project notes?'))return;
  const version=++detailVersion;const [{project,items},papers,chats]=await Promise.all([request('/projects/'+id),request('/papers'),request('/chats')]);if(!host.isConnected||version!==detailVersion)return;
  content.replaceChildren(el('h3',project.name));const notes=el('textarea');notes.maxLength=20000;notes.rows=6;notes.value=project.notes;notes.dataset.saved=notes.value;notes.setAttribute('aria-label','Project notes');
  content.append(notes,button('Save project notes',async()=>{const value=notes.value;await request('/projects/'+id,{notes:value},'PATCH');notes.dataset.saved=value;window.SpaceMindUI.toast('Project notes saved.');}));
  const choices=el('select');choices.setAttribute('aria-label','Paper or conversation to link');
  const values=[...papers.map(x=>({paper_id:x.id,title:x.title})),...chats.map(x=>({chat_id:x.id,title:x.title}))];
  values.forEach((x,i)=>{const o=el('option',(x.paper_id?'Paper: ':'Chat: ')+x.title);o.value=i;choices.append(o);});
  content.append(choices,button('Link to project',async()=>{const value=values[Number(choices.value)];if(value){await request('/project-items',{project_id:id,...value});await detail(id);}}));
  for(const item of items){const card=el('article');card.className='resource-card';card.append(el('h4',item.title));
   if(item.paper_id)card.append(button('Read paper',()=>readPaper(item.paper_id)));
   if(item.chat_id)card.append(button('Open conversation',()=>openChat(item.chat_id)));
   if(item.execution){const info=el('details');info.append(el('summary','Executed code and recorded output'),el('pre',item.execution.code),el('pre',item.execution.output));card.append(info,el('p','Recorded client output; not independently verified. Input files are not stored here.'),button('Download calculation record',()=>downloadArtifact(JSON.stringify(item.execution,null,2),'spacemind-calculation-record.json')));}
   card.append(button('Remove link / saved calculation',async()=>{if(!confirm('Remove this project item? Original papers and chats are kept.'))return;await request('/project-items/'+item.id,null,'DELETE');await detail(id);}));content.append(card);
  }
  content.append(button('Export project index',()=>downloadArtifact(JSON.stringify({schema:'spacemind.project.v1',project,items},null,2),'spacemind-project.json')),button('Delete project',async()=>{if(!confirm('Delete this project, its notes, links and saved calculation copies?'))return;await request('/projects/'+id,null,'DELETE');await mountProjects(host,{readPaper,openChat});}));
 }
}
