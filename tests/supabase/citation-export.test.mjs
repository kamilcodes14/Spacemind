import test from 'node:test';
import assert from 'node:assert/strict';
import '../../frontend/citation-export.js';
const {papers,bibtex,apa,download}=globalThis.SpaceMindCitations;
const paper={title:'Measuring H_0 & dark energy',source_file:'old filename.pdf',authors:['Ada Lovelace','Einstein, Albert'],year:2026,arxiv_id:'2610.01234',origin:'arxiv_abstract',url:'https://arxiv.org/abs/2610.01234'};

test('repeated chunks export one paper and retain richer metadata',()=>{
 const sources=[{...paper,authors:[],year:null},paper,{origin:'spacemind-tool-v1',source_file:'Orbit tool'},null];
 assert.equal(papers(sources).length,1);
 assert.deepEqual(papers(sources)[0].authors,paper.authors);
 assert.equal((bibtex(sources).match(/@misc/g)||[]).length,1);
 assert.match(bibtex(sources),/year = \{2026\}/);
});

test('BibTeX preserves real metadata, escapes TeX and omits unknown publication fields',()=>{
 const result=bibtex([paper,{source_file:'A {test} 50% \\input ^~#$',url:'javascript:alert(1)'}]);
 assert.match(result,/title = \{\{Measuring H\\_0 \\& dark energy\}\}/);
 assert.match(result,/author = \{Ada Lovelace and Einstein, Albert\}/);
 assert.match(result,/eprint = \{2610.01234\}/);
 assert.match(result,/archivePrefix = \{arXiv\}/);
 assert.match(result,/A \\\{test\\\} 50\\% \\textbackslash\{\}input/);
 assert.doesNotMatch(result,/javascript:|journal =|volume =|pages =/);
 assert.match(result,/@misc\{spacemind2,/);
});

test('APA draft uses available authors, date and archive without inventing details',()=>{
 assert.equal(apa([paper]),'Lovelace, A., & Einstein, A. (2026). Measuring H_0 & dark energy. arXiv. https://arxiv.org/abs/2610.01234');
 assert.equal(apa([{title:'NASA observations'}]),'NASA observations. (n.d.).');
 assert.equal(apa([{title:'Result',authors:['Curie, Marie-Skłodowska'],year:2024,doi:'https://doi.org/10.1234/example'}]),'Curie, M.-S. (2024). Result. https://doi.org/10.1234/example');
});

test('APA alphabetizes references and uses the 21+ author rule',()=>{
 const result=apa([{title:'Z paper',authors:['Zed']},{title:'A paper',authors:['Ada']}]);
 assert(result.indexOf('Ada')<result.indexOf('Zed'));
 const many=apa([{title:'Collaboration',authors:Array.from({length:21},(_,i)=>`Author${i}`)}]);
 assert.match(many,/Author18, … Author20/);
 assert.doesNotMatch(many,/Author19/);
});

test('untitled and tool-only results do not create empty or fabricated references',()=>{
 assert.deepEqual(papers([{snippet:'a snippet'},undefined,{source_file:'Python',origin:'spacemind-tool-v1'}]),[]);
 assert.equal(bibtex(null),'');
 assert.throws(()=>download([],'apa'),/No citation metadata/);
 assert.throws(()=>download([paper],'unknown'),/Choose/);
});

test('download produces a readable citation file and releases the object URL',async()=>{
 const oldDocument=globalThis.document,create=URL.createObjectURL,revoke=URL.revokeObjectURL;
 let blob,clicked=false,removed=false,revoked=false;
 const anchor={click(){clicked=true;},remove(){removed=true;}};
 globalThis.document={createElement:()=>anchor,body:{append(){}}};
 URL.createObjectURL=value=>{blob=value;return 'blob:citation-test';};
 URL.revokeObjectURL=value=>{assert.equal(value,'blob:citation-test');revoked=true;};
 try {
  download([paper],'apa');
  assert.equal(anchor.download,'spacemind-apa-references.txt');
  assert.equal(anchor.href,'blob:citation-test');
  assert(clicked&&removed);
  assert.match(await blob.text(),/^APA reference draft/);
  assert.match(await blob.text(),/Lovelace, A\./);
  await new Promise(resolve=>setTimeout(resolve,1100));
  assert(revoked);
 } finally {globalThis.document=oldDocument;URL.createObjectURL=create;URL.revokeObjectURL=revoke;}
});
