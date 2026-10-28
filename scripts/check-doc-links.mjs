import {execFileSync} from 'node:child_process';
import {readFileSync,existsSync} from 'node:fs';
import path from 'node:path';
const files=[...new Set(execFileSync('git',['ls-files','--cached','--others','--exclude-standard'],{encoding:'utf8'}).trim().split('\n'))].filter(f=>f.endsWith('.md')&&existsSync(f));
let checked=0;const broken=[];
for(const file of files){const text=readFileSync(file,'utf8').replace(/```[\s\S]*?```/g,'');const targets=[...text.matchAll(/\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g),...text.matchAll(/^\s*\[[^\]]+\]:\s*(\S+)/gm),...text.matchAll(/(?:href|src)="([^"]+)"/g)];for(const match of targets){const url=match[1].replace(/^<|>$/g,'');if(/^[a-z]+:|^\/\//i.test(url))continue;checked++;const [local,anchor]=url.split('#'),target=path.resolve(path.dirname(file),decodeURIComponent(local||path.basename(file)));if(!existsSync(target)){broken.push({file,url,reason:'missing target'});continue;}if(anchor&&target.endsWith('.md')){const headings=[...readFileSync(target,'utf8').matchAll(/^#{1,6}\s+(.+)$/gm)].map(m=>m[1].toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu,'').replace(/\s/g,'-'));if(!headings.includes(decodeURIComponent(anchor)))broken.push({file,url,reason:'missing heading'});}}}
console.log(JSON.stringify({scope:'Local Markdown paths and heading anchors; external URLs not checked',files:files.length,checked,broken},null,2));if(broken.length)process.exitCode=1;
