export function csv(rows){
 if(!Array.isArray(rows)||!rows.length)return '';
 const keys=[...new Set(rows.flatMap(r=>Object.keys(r)))];
 const cell=value=>{let s=value==null?'':typeof value==='object'?JSON.stringify(value):String(value);if(typeof value==='string'&&/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
 return [keys.map(cell).join(','),...rows.map(row=>keys.map(k=>cell(row[k])).join(','))].join('\r\n');
}
export function notebook({code,output,images=[]}){
 return {nbformat:4,nbformat_minor:5,metadata:{kernelspec:{display_name:'Python 3',language:'python',name:'python3'},language_info:{name:'python'}},cells:[
 {id:'assumptions',cell_type:'markdown',metadata:{},source:['# SpaceMind calculation\n','Review code, assumptions and units before running. Uploaded data files are not included; supply them separately. Results were produced in a browser Python session and are not independently verified.\n']},
 {id:'calculation',cell_type:'code',metadata:{},source:[code],execution_count:1,outputs:[{output_type:'stream',name:'stdout',text:[output]},...images.map(png=>({output_type:'display_data',data:{'image/png':png},metadata:{}}))]}
 ]};
}
export function downloadArtifact(text,name,type='application/json'){const object=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=object;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(object),1000);}
