import test from 'node:test';
import assert from 'node:assert/strict';
import {researchBundle,sha256} from '../../frontend/science/reproducibility.js';
import {notebook} from '../../frontend/science/notebook.js';
import {executionSnapshot} from '../../frontend/projects.js';
const execution={code:'print(42)',output:'42\n',completed_at:'2026-10-25T00:00:00Z',environment:{python:'3.12',packages:{numpy:'2.3.5'}},inputs:[{name:'data.csv',sha256:'a'.repeat(64),base64:'NDI='}],context:{kind:'python'},limits:{stdout_truncated:false}};
test('reproducibility container preserves original execution and independently checkable hashes',async()=>{
 const bundle=await researchBundle(execution,notebook);
 assert.equal(bundle.files['calculation.py'],'print(42)');assert.equal(bundle.files['stdout.txt'],'42\n');
 assert.equal(bundle.checksums['stdout.txt'],'084c799cd551dd1d8d5c5f9a5d593b2e931f5e36122ee5c793c1d08a19839cc0');
 assert.equal(await sha256('42\n'),bundle.checksums['stdout.txt']);
 const n=JSON.parse(bundle.files['notebook.ipynb']);assert.equal(n.metadata.spacemind.environment.packages.numpy,'2.3.5');assert.equal(n.metadata.spacemind.inputs[0].base64,undefined);assert.equal(bundle.execution.inputs[0].base64,'NDI=');
 assert.notEqual(await sha256('43\n'),bundle.checksums['stdout.txt']);
});
test('incomplete runs cannot be exported or saved; saved project snapshots exclude private input bytes',async()=>{
 await assert.rejects(researchBundle({code:'print(42)'},notebook));assert.throws(()=>executionSnapshot({code:'print(42)'}));
 const saved=executionSnapshot(execution);assert.equal(saved.inputs[0].base64,undefined);assert.equal(saved.inputs[0].sha256,'a'.repeat(64));assert.equal(saved.output,'42\n');
 assert.throws(()=>executionSnapshot({...execution,output:'x'.repeat(180000)}),/too large/);
});
