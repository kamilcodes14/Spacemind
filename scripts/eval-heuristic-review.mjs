// Manual review support.
//   node scripts/eval-review.mjs sample [report.json] [n=15] [seed=1]  -> writes <report>-review.csv
//   node scripts/eval-review.mjs score  <review.csv>                    -> agreement of automatic grader with human labels
import {readFile,writeFile} from 'node:fs/promises';
const [cmd,file,a,b]=process.argv.slice(2);
const csv=v=>`"${String(v??'').replace(/"/g,'""').replace(/\r?\n/g,' ⏎ ')}"`;
const parse=text=>{const rows=[];let row=[],cur='',q=false;for(let i=0;i<text.length;i++){const c=text[i];if(q){if(c==='"'&&text[i+1]==='"'){cur+='"';i++;}else if(c==='"')q=false;else cur+=c;}else if(c==='"')q=true;else if(c===','){row.push(cur);cur='';}else if(c==='\n'){row.push(cur);rows.push(row);row=[];cur='';}else if(c!=='\r')cur+=c;}if(cur||row.length){row.push(cur);rows.push(row);}return rows;};
function rng(seed){let s=seed>>>0||1;return()=>(s=(s*1664525+1013904223)>>>0)/2**32;}
export function stratifiedSample(results,n,seed=1){
 const rand=rng(seed),by={};for(const r of results.filter(r=>!r.error))(by[r.category]??=[]).push(r);
 const cats=Object.keys(by).sort(),pick=[];let i=0;
 for(const c of cats)by[c].sort(()=>rand()-0.5);
 // Round-robin across categories; always include every automatic failure from small categories first.
 while(pick.length<n&&cats.some(c=>by[c].length)){const c=cats[i++%cats.length];if(by[c].length)pick.push(by[c].shift());}
 return pick;}
export function cohenKappa(pairs){const n=pairs.length;if(!n)return null;const po=pairs.filter(([x,y])=>x===y).length/n;
 const p1a=pairs.filter(([x])=>x).length/n,p1h=pairs.filter(([,y])=>y).length/n,pe=p1a*p1h+(1-p1a)*(1-p1h);return pe===1?1:(po-pe)/(1-pe);}
if(cmd==='sample'){
 const path=file||'evals/latest-report.json',report=JSON.parse(await readFile(path,'utf8')),sample=stratifiedSample(report.results,Number(a||15),Number(b||1));
 const head=['id','category','question','reference_answer','answer','auto_pass','auto_dimensions','source_titles','human_factual_ok(1/0)','human_citation_supported(1/0/NA)','human_overall_pass(1/0)','notes'];
 const lines=[head.join(',')].concat(sample.map(r=>[r.id,r.category,r.question,r.reference_answer,r.answer,r.grade.pass?1:0,JSON.stringify(r.grade.dimensions),(r.citations||[]).map(c=>c.source_file).join(' | '),'','','',''].map(csv).join(',')));
 const out=path.replace(/\.json$/,'')+'-review.csv';await writeFile(out,lines.join('\n'));console.log(`Wrote ${sample.length} items for human review to ${out}`);
}else if(cmd==='score'){
 const rows=parse(await readFile(file,'utf8')),h=rows[0],ix=k=>h.indexOf(k),done=rows.slice(1).filter(r=>['0','1'].includes(r[ix('human_overall_pass(1/0)')]?.trim()));
 const pairs=done.map(r=>[r[ix('auto_pass')]==='1',r[ix('human_overall_pass(1/0)')].trim()==='1']);
 const fp=pairs.filter(([x,y])=>x&&!y).length,fn=pairs.filter(([x,y])=>!x&&y).length;
 console.log(JSON.stringify({reviewed:pairs.length,agreement:pairs.length?+(pairs.filter(([x,y])=>x===y).length/pairs.length).toFixed(3):null,cohen_kappa:pairs.length?+cohenKappa(pairs).toFixed(3):null,auto_pass_but_human_fail:fp,auto_fail_but_human_pass:fn},null,1));
}else if(cmd)console.error('Usage: sample [report] [n] [seed] | score <review.csv>');
