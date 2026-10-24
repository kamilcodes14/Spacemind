import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
const ctx={window:{},URL};vm.runInNewContext(await readFile(new URL('../../frontend/evidence-view.js',import.meta.url),'utf8'),ctx);
const E=ctx.window.SpaceMindEvidence;
test('source labels prefer the server label and fall back for legacy saved answers',()=>{
 assert.equal(E.sourceLabel({evidence_label:'Full text · arXiv preprint'}),'Full text · arXiv preprint');
 assert.equal(E.sourceLabel({origin:'arxiv_abstract'}),'Abstract only');assert.equal(E.sourceLabel({origin:'arxiv'}),'');
});
test('passages: legacy quotes still render; links must be http(s); pages only when integers',()=>{
 assert.deepEqual(JSON.parse(JSON.stringify(E.passages({supporting_quotes:['old quote']}))),[{quote:'old quote',page:null,href:'',linkLabel:''}]);
 const p=E.passages({supporting_passages:[{quote:'a b c d',page:3,text_fragment_url:'https://x.org/a#:~:text=a%20b',url:'https://x.org/a'},{quote:'e f g h',url:'javascript:alert(1)'},{quote:'  '},{quote:'i j k l',page:'2',url:'https://y.org/'}]});
 assert.equal(p.length,3);assert.equal(p[0].page,3);assert.equal(p[0].linkLabel,'Open at passage ↗');assert.equal(p[1].href,'');assert.equal(p[2].page,null);assert.equal(p[2].linkLabel,'Open source ↗');
});
test('coverage summary is plain, singular/plural correct, and reports missing terms',()=>{
 assert.equal(E.evidenceSummary({documents:3,full_text_documents:1,abstract_only_documents:2,by_kind:{web:0},uncovered_terms:[]}),'3 documents: 1 with full text, 2 abstract only.');
 assert.match(E.evidenceSummary({documents:1,full_text_documents:0,abstract_only_documents:0,by_kind:{web:1},uncovered_terms:['magnetar']}),/^1 document: 1 web page\. Not found in the evidence: magnetar\.$/);
 assert.equal(E.evidenceSummary(null),'');assert.equal(E.evidenceSummary({}),'');
});
test('claim labels distinguish a numeric-guard downgrade',()=>{
 assert.match(E.claimLabel({status:'partial',support_basis:'numeric_guard'}),/number is missing/);
 assert.equal(E.claimLabel({status:'partial'}),'Partially supported');assert.equal(E.claimLabel({status:'supported'}),'Supported by excerpt');assert.equal(E.claimLabel({status:'weird'}),'Not verified');
});
