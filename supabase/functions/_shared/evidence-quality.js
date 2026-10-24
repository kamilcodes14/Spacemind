// Phase 2: source identity, de-duplication, paper-first ordering, evidence coverage and
// supporting-passage links. Pure functions: no network, no model calls.
// Honesty rules: "preprint" is only claimed for arXiv records; nothing is called "published"
// without metadata; page numbers exist only for uploaded PDFs (corpus chunks carry none).
const STOP=new Set('about after again against also among because been before being between both cannot could does doing during each from have having here into more most other over same should since some such than that their them then there these they this those through under until very were what when where which while will with within without would your explain describe tell give what whose who whom how why'.split(' '));
const norm=s=>String(s??'').toLowerCase().replace(/[\u2018\u2019]/g,"'").replace(/[^\p{L}\p{N}.+\- ]+/gu,' ').replace(/\s+/g,' ').trim();
export const baseArxivId=id=>typeof id==='string'?id.trim().replace(/^arxiv:/i,'').replace(/v\d+$/i,'').toLowerCase():'';
export function canonicalKey(s){
 if(s.origin==='uploaded_pdf'&&s.doc_id)return 'upload:'+s.doc_id;
 const ax=baseArxivId(s.arxiv_id||(/^arxiv:/i.test(s.doc_id||'')?s.doc_id:''));if(ax)return 'arxiv:'+ax;
 if(s.doi)return 'doi:'+String(s.doi).toLowerCase();
 const t=norm((s.title||s.source_file||'').replace(/\s*[·(]\s*p\.? ?\d+.*$/i,''));if(t.length>=12)return 'title:'+t;
 return 'url:'+(s.url||s.doc_id||s.source_file||'');}
export function classifySource(s){
 const o=s.origin||'';
 if(o==='uploaded_pdf')return {evidence_kind:'uploaded_pdf',publication_status:'user_supplied',evidence_label:`Uploaded PDF${s.page?`, page ${s.page}`:''}`};
 if(o==='arxiv')return {evidence_kind:'full_text',publication_status:'unknown',evidence_label:'Full-text excerpt · arXiv version (publication status unverified)'};
 if(o==='arxiv_abstract')return {evidence_kind:'abstract',publication_status:'unknown',evidence_label:'Abstract only · arXiv version (publication status unverified)'};
 if(o==='ntrs')return {evidence_kind:'full_text',publication_status:'nasa_technical_report',evidence_label:'Full text · NASA technical report'};
 if(o==='ntrs_abstract')return {evidence_kind:'abstract',publication_status:'nasa_technical_report',evidence_label:'Abstract only · NASA technical report'};
 if(o==='semantic_scholar_abstract')return {evidence_kind:'abstract',publication_status:'unknown',evidence_label:`Abstract only · Semantic Scholar record${s.doi?' (DOI supplied; venue not checked)':' (publication status unknown)'}`};
 if(o==='web')return {evidence_kind:'web',publication_status:'web_page',evidence_label:'Web source (publication status unverified)'};
 if(o==='execution_output'||o==='spacemind-tool-v1')return {evidence_kind:'tool_output',publication_status:'computed',evidence_label:'Computed output'};
 return {evidence_kind:'unknown',publication_status:'unknown',evidence_label:'Source type unknown'};}
const TIER={uploaded_pdf:0,full_text:1,abstract:2,web:3,tool_output:4,unknown:5};
const shingles=text=>{const w=norm(text).split(' ').filter(Boolean),out=new Set();for(let i=0;i+4<=w.length;i++)out.add(w.slice(i,i+4).join(' '));return out;};
export function similarity(a,b){const A=shingles(a),B=shingles(b);if(!A.size||!B.size)return 0;let hit=0;for(const x of A)if(B.has(x))hit++;return hit/Math.min(A.size,B.size);}
// Keep the best-tier chunk for a passage; keep different passages of the same paper.
export function dedupeSources(sources,{threshold=0.7}={}){
 const annotated=sources.map((s,order)=>({...s,...classifySource(s),canonical_key:canonicalKey(s),_order:order}));
 const ranked=[...annotated].sort((a,b)=>TIER[a.evidence_kind]-TIER[b.evidence_kind]||a._order-b._order);
 const kept=[];let removed=0;
 for(const s of ranked){
  const twin=kept.find(k=>k.canonical_key===s.canonical_key&&(similarity(k.snippet||'',s.snippet||'')>=threshold||(k.url&&k.url===s.url&&(k.snippet||'').slice(0,80)===(s.snippet||'').slice(0,80))));
  if(twin){removed++;(twin.also_indexed_as??=[]).push(s.evidence_kind);continue;}
  kept.push(s);}
 return {sources:kept.sort((a,b)=>a._order-b._order).map(({_order,...s})=>s),removed};}
// Scholarly sources first (stable), web next, scholarly below the relevance floor last.
export function paperFirstOrder(sources,{floor=0.15}={}){
 const scholarly=s=>['full_text','abstract','uploaded_pdf'].includes(s.evidence_kind);
 const rel=s=>typeof s.rerank_score==='number'?s.rerank_score:1;
 const top=sources.filter(s=>scholarly(s)&&rel(s)>=floor),web=sources.filter(s=>!scholarly(s)),weak=sources.filter(s=>scholarly(s)&&rel(s)<floor);
 return [...top,...web,...weak];}
const contentTerms=q=>[...new Set(norm(q).split(' ').filter(t=>t.length>=4&&!STOP.has(t)))];
export function evidenceCoverage(query,sources){
 const kinds={full_text:0,abstract:0,uploaded_pdf:0,web:0,tool_output:0,unknown:0},docs=new Map();
 for(const s of sources){kinds[s.evidence_kind||'unknown']++;const k=s.canonical_key||canonicalKey(s);const d=docs.get(k)||{kind:s.evidence_kind,chunks:0};d.chunks++;if(TIER[s.evidence_kind]<TIER[d.kind])d.kind=s.evidence_kind;docs.set(k,d);}
 const text=norm(sources.map(s=>`${s.title||s.source_file||''} ${s.snippet||''}`).join(' ')),terms=contentTerms(query);
 const uncovered=terms.filter(t=>!text.includes(t));
 const scholarlyDocs=[...docs.values()].filter(d=>['full_text','abstract','uploaded_pdf'].includes(d.kind));
 const warnings=[];
 if(scholarlyDocs.length&&scholarlyDocs.every(d=>d.kind==='abstract'))warnings.push('Only paper abstracts were available for this answer; full-text details were not checked.');
 if(sources.length&&!scholarlyDocs.length&&kinds.web)warnings.push('No paper evidence was found; this answer rests on web sources.');
 if(terms.length>=3&&uncovered.length/terms.length>0.5)warnings.push(`The retrieved evidence does not mention: ${uncovered.slice(0,4).join(', ')}.`);
 if(docs.size===1&&sources.length>1)warnings.push('All evidence comes from a single document.');
 return {documents:docs.size,by_kind:kinds,full_text_documents:[...docs.values()].filter(d=>d.kind==='full_text'||d.kind==='uploaded_pdf').length,abstract_only_documents:[...docs.values()].filter(d=>d.kind==='abstract').length,
  query_terms:terms.length,uncovered_terms:uncovered,coverage:terms.length?+(1-uncovered.length/terms.length).toFixed(2):null,warnings};}
const escFrag=s=>encodeURIComponent(s).replace(/[-,&]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
// A link that opens the source at the supporting passage when the source type allows it.
export function supportLink(source,quote){
 let url=null;try{const u=new URL(source.url||'');if(['https:','http:'].includes(u.protocol)&&!/\.pdf($|[?#])/i.test(u.pathname))url=u.href.split('#')[0];}catch{/* no link */}
 const words=String(quote||'').replace(/\s+/g,' ').trim().split(' ').filter(Boolean);
 const result={page:Number.isInteger(source.page)?source.page:null,url:source.url||null,text_fragment_url:null};
 if(url&&words.length>=4&&['web','abstract'].includes(source.evidence_kind))result.text_fragment_url=`${url}#:~:text=${escFrag(words.slice(0,8).join(' '))}`;
 return result;}
// Numbers in a claim must appear in its cited text; otherwise "supported" is downgraded.
const numTokens=s=>[...String(s).replace(/\[\d+\]/g,' ').replace(/(\d),(?=\d{3}\b)/g,'$1').replace(/\u2212/g,'-').matchAll(/(?<![\w.])[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?(?![\w.])/g)].map(m=>Number(m[0]));
export function guardClaimNumbers(claims,sources){
 return claims.map(c=>{
  const evidence=String(c.citations.filter(n=>sources[n-1]).map(n=>sources[n-1].snippet||'').join(' ')).replace(/(\d),(?=\d{3}\b)/g,'$1');
  const available=new Set(numTokens(evidence));
  const missing=[...new Set(numTokens(c.text).filter(n=>!available.has(n)))];
  if(c.status==='supported'&&missing.length)return {...c,status:'partial',support_basis:'numeric_guard',reason:`Not every number is in the cited excerpt: ${missing.slice(0,4).join(', ')}.`};
  return {...c,support_basis:c.status==='unverified'?'not_checked':'model_verifier_with_exact_quote'};});}
