import test from 'node:test';import assert from 'node:assert/strict';
import {extractPaperPDF} from '../../frontend/pdf-extract.js';
const text='This is an observational astronomy paper with useful extracted text and units.';
const file=(data='%PDF-test')=>({name:'paper.pdf',size:data.length,arrayBuffer:async()=>new TextEncoder().encode(data).buffer});
function parser(rows){let destroyed=0,cleaned=0;return {getDocument:()=>({promise:Promise.resolve({numPages:rows.length,getPage:async n=>({getTextContent:async()=>({items:[{str:rows[n-1],transform:[1,0,0,1,0,0]}]}),cleanup:()=>cleaned++})}),destroy:async()=>{destroyed++;}}),counts:()=>({destroyed,cleaned})};}
test('PDF identity is byte-based, sparse pages and parser provenance are recorded',async()=>{
 const p=parser([text,'']);const progress=[];const a=await extractPaperPDF(file(),{...p,parserVersion:'test',onProgress:x=>progress.push(x)});
 assert.equal(a.metadata.content_sha256.length,64);assert.deepEqual(a.metadata.sparse_pages,[2]);assert.equal(a.metadata.page_count,2);assert.equal(a.metadata.parser_version,'test');assert.equal(progress.at(-1).page,2);assert.equal(p.counts().cleaned,2);assert.equal(p.counts().destroyed,1);
 const b=await extractPaperPDF(file('%PDF-other'),{...parser([text]),parserVersion:'test'});assert.notEqual(a.metadata.content_sha256,b.metadata.content_sha256);
});
test('oversized pages are rejected instead of silently truncated',async()=>{
 await assert.rejects(extractPaperPDF(file(),{...parser(['a'.repeat(50001)]),parserVersion:'test'}),/silently truncated/);
});
test('scanned and malformed PDFs fail honestly',async()=>{
 await assert.rejects(extractPaperPDF(file(),{...parser(['']),parserVersion:'test'}),/OCR/);
 await assert.rejects(extractPaperPDF(file('not pdf'),{...parser([text]),parserVersion:'test'}),/valid PDF/);
});
test('cancellation prevents extraction results from being saved',async()=>{
 const c=new AbortController();c.abort();await assert.rejects(extractPaperPDF(file(),{...parser([text]),signal:c.signal}),{name:'AbortError'});
 const d=new AbortController();await assert.rejects(extractPaperPDF(file(),{...parser([text,text]),signal:d.signal,onProgress:p=>{if(p.page===1)d.abort();}}),{name:'AbortError'});
});
