// A portable, inspectable container. Input bytes are opt-in; manifests are always included.
export async function sha256(value) {
 const bytes=typeof value==='string'?new TextEncoder().encode(value):value;
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
}
export async function researchBundle(execution, notebookFactory) {
 if(!execution?.completed_at||typeof execution.code!=='string')throw Error('Complete a calculation before exporting.');
 const files={'calculation.py':execution.code,'stdout.txt':execution.output,'results.csv':execution.csv||'',
  'notebook.ipynb':JSON.stringify(notebookFactory(execution),null,2)};
 const checksums={};for(const [name,content]of Object.entries(files))checksums[name]=await sha256(content);
 return {schema:'spacemind.reproducibility.v1',created_at:new Date().toISOString(),execution,files,checksums,
  instructions:'Inspect calculation.py before running. Install the recorded package versions in an isolated Python environment. Restore the listed inputs under /work (or adjust those explicit paths in a copy). Verify SHA256 checksums before use. Original output is recorded, not a promise of bitwise reproduction across platforms.',
  limits:['Client-side execution; not independently verified.','External services and browser/runtime differences may affect reproduction.','Inputs without embedded bytes must be supplied separately using their recorded checksums.']};
}
