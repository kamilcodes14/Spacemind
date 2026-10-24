import {readFile,writeFile} from 'node:fs/promises';
import {digest,RUBRIC_VERSION,validateReview,summarize} from './eval-review.mjs';
const file=process.argv[2];
if(!file)throw Error('Usage: node scripts/review-evaluation.mjs <reviewed-report.json>');
const report=JSON.parse(await readFile(file,'utf8'));
const cases=JSON.parse(await readFile('evals/space-questions.json','utf8'));
if(report.dataset_sha256!==digest(cases)||report.rubric_version!==RUBRIC_VERSION)throw Error('Dataset/rubric changed: review against the captured revision.');
if(new Set(report.results.map(r=>r.id)).size!==report.results.length||report.results.some(r=>!cases.find(c=>c.id===r.id)))throw Error('Duplicate or unknown case IDs');
for(const row of report.results){
 row.review_errors=row.error?['Request failed']:validateReview(row.review,row,cases.find(c=>c.id===row.id));
 row.review_valid=row.review_errors.length===0;
}
report.summary=summarize(report);
report.status=report.summary.quality_pass?'reviewed_pass':'incomplete_or_failed';
await writeFile(file,JSON.stringify(report,null,2));
console.log(JSON.stringify(report.summary,null,2));
if(!report.summary.quality_pass)process.exitCode=1;
