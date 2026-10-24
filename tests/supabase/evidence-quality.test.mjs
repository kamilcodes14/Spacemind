import test from 'node:test';import assert from 'node:assert/strict';
import {classifySource,canonicalKey,dedupeSources,paperFirstOrder,evidenceCoverage,supportLink,guardClaimNumbers,baseArxivId,similarity} from '../../supabase/functions/_shared/evidence-quality.js';
import {research} from '../../supabase/functions/_shared/research.js';
const abs='We infer the mass and radius of PSR J0740+6620 jointly with magnetic geometry using NICER pulse profiles and find a radius near 12.4 km.';
const full=`${abs} Section 2 describes the data in detail and the modelling of hot spots on the stellar surface.`;
const A={source_file:'Joint Mass-Radius Inference of PSR J0740+6620',origin:'arxiv_abstract',doc_id:'arxiv:2609.37928v1',arxiv_id:'2609.37928v1',url:'https://arxiv.org/abs/2609.37928v1',snippet:abs};
const F={...A,origin:'arxiv',snippet:full};
const F2={...F,snippet:'Hot spot geometry is parameterised by two ovals; priors on compactness are uniform in the range 0.1 to 0.3 for the sampler runs.'};
const W={source_file:'NASA news',origin:'web',url:'https://nasa.gov/x',snippet:'A neutron star result was announced.'};

test('source classification is honest about preprints, abstracts and unknown venues',()=>{
 assert.equal(classifySource(F).evidence_kind,'full_text');assert.equal(classifySource(F).publication_status,'unknown');
 assert.equal(classifySource(A).evidence_kind,'abstract');
 assert.match(classifySource(F).evidence_label,/publication status unverified/);
 assert.equal(classifySource({origin:'semantic_scholar_abstract'}).publication_status,'unknown');
 assert.equal(classifySource({origin:'semantic_scholar_abstract',doi:'10.1/x'}).publication_status,'unknown');
 assert.equal(classifySource({origin:'uploaded_pdf',page:4}).evidence_label,'Uploaded PDF, page 4');
 assert.equal(classifySource({origin:'web'}).evidence_kind,'web');
 for(const k of ['arxiv','arxiv_abstract','web'])assert.ok(!/published/i.test(classifySource({origin:k}).evidence_label));
});
test('canonical identity ignores arXiv version, DOI case and uploaded page suffix',()=>{
 assert.equal(canonicalKey({arxiv_id:'2609.37928v2'}),canonicalKey({doc_id:'arxiv:2609.37928v1'}));
 assert.equal(baseArxivId('arXiv:2609.37928V3'),'2609.37928');
 assert.equal(canonicalKey({doi:'10.1/ABC'}),canonicalKey({doi:'10.1/abc'}));
 assert.equal(canonicalKey({title:'A Long Paper Title Here',source_file:'x'}),canonicalKey({source_file:'A long paper title here · p. 3'}));
});
test('de-duplication drops the abstract copy of a passage held as full text, keeps distinct passages and other papers',()=>{
 const other={source_file:'Another paper about quasars',origin:'arxiv',arxiv_id:'2609.1111v1',doc_id:'arxiv:2609.1111v1',url:'https://arxiv.org/abs/2609.1111',snippet:'Quasar variability depends on Eddington ratio in the sample studied here.'};
 const {sources,removed}=dedupeSources([A,F,F2,other]);
 assert.equal(removed,1);assert.equal(sources.length,3);
 assert.ok(!sources.some(s=>s.evidence_kind==='abstract'),'abstract copy removed');
 assert.ok(sources.find(s=>s.snippet===full).also_indexed_as.includes('abstract'));
 assert.deepEqual(sources.map(s=>s.snippet),[full,F2.snippet,other.snippet],'original relevance order preserved');
 assert.ok(similarity(abs,full)>=0.7);
});
test('an abstract with no full-text twin is kept and labelled',()=>{const {sources}=dedupeSources([A]);assert.equal(sources.length,1);assert.equal(sources[0].evidence_kind,'abstract');});
test('paper-first ordering: papers lead web; irrelevant papers drop below web; order is stable',()=>{
 const mk=(o,score,id)=>({...classifySource({origin:o}),origin:o,rerank_score:score,id});
 const out=paperFirstOrder([mk('web',.9,'w1'),mk('arxiv',.5,'p1'),mk('arxiv_abstract',.05,'p-weak'),mk('arxiv',.4,'p2'),mk('web',.8,'w2')]);
 assert.deepEqual(out.map(s=>s.id),['p1','p2','w1','w2','p-weak']);
});
test('coverage reports kinds, uncovered terms and explicit warnings',()=>{
 const cov=evidenceCoverage('How does magnetar flare quenching affect dwarf galaxies?',dedupeSources([A]).sources);
 assert.equal(cov.abstract_only_documents,1);assert.ok(cov.uncovered_terms.includes('magnetar'));
 assert.ok(cov.warnings.some(w=>/Only paper abstracts/.test(w)));assert.ok(cov.warnings.some(w=>/does not mention/.test(w)));
 const web=evidenceCoverage('neutron star news',dedupeSources([W]).sources);assert.ok(web.warnings.some(w=>/No paper evidence/.test(w)));
 const good=evidenceCoverage('mass radius PSR J0740+6620',dedupeSources([F,F2]).sources);assert.equal(good.full_text_documents,1);assert.ok(good.warnings.some(w=>/single document/.test(w)));
});
test('supporting passage links: text fragments for web/abstract pages, page numbers for uploads, none for PDFs',()=>{
 const l=supportLink({...A,evidence_kind:'abstract'},'a radius near 12.4 km, with uncertainty');
 assert.ok(l.text_fragment_url.startsWith('https://arxiv.org/abs/2609.37928v1#:~:text=a%20radius%20near%2012.4%20km'));
 assert.ok(!supportLink({url:'https://x.org/p.pdf',evidence_kind:'full_text'},'one two three four five').text_fragment_url);
 const up=supportLink({origin:'uploaded_pdf',page:3,evidence_kind:'uploaded_pdf',url:'https://example.org/a'},'one two three four five');assert.equal(up.page,3);assert.equal(up.text_fragment_url,null);
 assert.equal(supportLink({url:'javascript:alert(1)',evidence_kind:'web'},'one two three four five').text_fragment_url,null);
 assert.equal(supportLink({url:'https://x.org/a',evidence_kind:'web'},'too short').text_fragment_url,null);
 assert.ok(supportLink({url:'https://x.org/a',evidence_kind:'web'},'a-b, c&d e f g').text_fragment_url.includes('a%2Db%2C'));
});
test('numeric guard downgrades "supported" claims whose numbers are not in the cited excerpt',()=>{
 const sources=[{snippet:'The radius is near 12.4 km and the mass is 2.08 solar masses.'}];
 const out=guardClaimNumbers([{id:0,text:'The mass is 2.08 solar masses [1].',citations:[1],status:'supported',evidence:[]},{id:1,text:'The mass is 3.5 solar masses [1].',citations:[1],status:'supported',evidence:[]},{id:2,text:'It is compact [1].',citations:[1],status:'unverified',evidence:[]}],sources);
 assert.equal(out[0].status,'supported');assert.equal(out[1].status,'partial');assert.equal(out[1].support_basis,'numeric_guard');assert.match(out[1].reason,/3\.5/);assert.equal(out[2].support_basis,'not_checked');
});
const rankAndVerify=answer=>async(_u,o)=>{const b=JSON.parse(o.body),sys=b.messages[0].content;
 const r=d=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(d)},finish_reason:'stop'}]}),{headers:{'Content-Type':'application/json'}});
 if(sys.startsWith('Rank evidence')){const {documents}=JSON.parse(b.messages[1].content);return r({ranking:documents.map((d,i)=>({index:d.index,relevance:1-i*.1}))});}
 if(sys.startsWith('Verify each')){const {claims}=JSON.parse(b.messages[1].content);return r({claims:claims.map(c=>({id:c.id,status:'supported',reason:'ok',evidence:c.snippets.map(s=>({citation:s.citation,quote:s.text.slice(0,60)}))}))});}
 return r({answer,confident:true,follow_up_questions:[]});};
const base={question:'What radius was inferred for PSR J0740+6620?',chatId:'33333333-3333-4333-8333-333333333333',depth:'technical',useWeb:false};
test('research(): duplicates collapse, sources are labelled, coverage and passage links are returned',async()=>{
 const r=await research(base,[],{env:{GROQ_API_KEY:'t'},lookupPapers:async()=>[A,F,F2],fetcher:rankAndVerify('The radius is near 12.4 km [1].')});
 assert.equal(r.citations.length,2);assert.equal(r.evidence_summary.duplicates_removed,1);
 assert.equal(r.citations[0].evidence_kind,'full_text');assert.equal(r.citations[0].publication_status,'unknown');
 assert.equal(r.evidence_summary.full_text_documents,1);
 assert.ok(r.citations[0].supporting_passages.length>=1&&r.citations[0].supporting_passages[0].quote);
 assert.equal(r.claim_checks[0].support_basis,'model_verifier_with_exact_quote');assert.equal(r.confident,true);
});
test('research(): a verifier "supported" label with a number absent from the excerpt cannot produce a confident answer',async()=>{
 const r=await research(base,[],{env:{GROQ_API_KEY:'t'},lookupPapers:async()=>[F],fetcher:rankAndVerify('The radius is near 13.9 km [1].')});
 assert.equal(r.claim_checks[0].status,'partial');assert.equal(r.confident,false);assert.ok(r.warnings.some(w=>/could not be verified/.test(w)));
});
test('research(): a lone abstract triggers an explicit abstract-only warning',async()=>{
 const r=await research(base,[],{env:{GROQ_API_KEY:'t'},lookupPapers:async()=>[A],fetcher:rankAndVerify('The radius is near 12.4 km [1].')});
 assert.ok(r.warnings.some(w=>/Only paper abstracts/.test(w)));assert.equal(r.citations[0].evidence_kind,'abstract');
});
test('research(): in auto mode with a fresh-news query, paper evidence precedes web evidence even when web is retrieved first',async()=>{
 const inner=rankAndVerify('The radius is near 12.4 km [1]. A recent news item exists [2].');
 const fetcher=async(url,o)=>{
  if(String(url).includes('api.tavily.com'))return new Response(JSON.stringify({results:[{title:'NASA news',url:'https://nasa.gov/x',content:'A recent neutron star result was announced with a radius near 12.4 km.'}]}),{headers:{'Content-Type':'application/json'}});
  const b=JSON.parse(o.body);
  if(b.messages[0].content.startsWith('You are SpaceMind, a friendly'))return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({mode:'research',query:'latest PSR J0740+6620 radius'})},finish_reason:'stop'}]}),{headers:{'Content-Type':'application/json'}});
  return inner(url,o);};
 const r=await research({...base,question:'What is the latest radius for PSR J0740+6620?',useWeb:null},[],{env:{GROQ_API_KEY:'t',TAVILY_API_KEY:'t'},lookupPapers:async()=>[F],fetcher});
 assert.deepEqual(r.citations.map(c=>c.evidence_kind),['full_text','web']);assert.equal(r.used_web,true);
});

test('numeric guard respects whole signed and exponent values',()=>{
 for(const [claim,source] of [['2','12'],['-2','2'],['1e5','1e6']]){
  const out=guardClaimNumbers([{text:`Mass is ${claim} solar masses [1].`,citations:[1],status:'supported'}],[{snippet:`Mass is ${source} solar masses.`}]);assert.equal(out[0].status,'partial');
 }
});
test('distinct uploads retain identity despite identical titles and snippets',()=>{
 const sources=['a','b'].map(doc_id=>({origin:'uploaded_pdf',doc_id,title:'Identical scientific paper title',snippet:'A long repeated passage describing a scientific result.'}));assert.notEqual(canonicalKey(sources[0]),canonicalKey(sources[1]));assert.equal(dedupeSources(sources).sources.length,2);
});
test('full-text chunks do not promise to locate quotes on an abstract landing page',()=>{
 assert.equal(supportLink({...F,evidence_kind:'full_text'},'one two three four five').text_fragment_url,null);
});
