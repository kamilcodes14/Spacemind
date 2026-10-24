import {readFile} from 'node:fs/promises';
import {digest,RUBRIC_VERSION,validateReview,summarize} from './eval-review.mjs';
const paths=process.argv.slice(2);
if(paths.length!==2)throw Error('Usage: node scripts/compare-evaluations.mjs baseline.json rerun.json');
const cases=JSON.parse(await readFile('evals/space-questions.json','utf8'));
const reports=await Promise.all(paths.map(async path=>JSON.parse(await readFile(path,'utf8'))));
for(const r of reports){
 if(r.dataset_sha256!==digest(cases)||r.rubric_version!==RUBRIC_VERSION)throw Error('Cannot compare different datasets or rubrics.');
 if(r.results.length!==50||new Set(r.results.map(x=>x.id)).size!==50)throw Error('Both runs must contain all 50 unique cases.');
 if(!r.backend_revision||r.backend_revision==='unrecorded')throw Error('Record actual backend deployment revisions before comparison.');
 for(const row of r.results){const item=cases.find(c=>c.id===row.id);if(!item||row.mode!==item.mode)throw Error('Case identity/mode mismatch');row.review_valid=!row.error&&validateReview(row.review,row,item).length===0;if(!row.error&&!row.review_valid)throw Error('Independent review incomplete');}
}
if(reports[0].target!==reports[1].target)throw Error('Targets differ.');
console.log(JSON.stringify({baseline:summarize(reports[0]),rerun:summarize(reports[1]),note:'Failures remain in denominators; no claim of statistical significance from one run.'},null,2));
