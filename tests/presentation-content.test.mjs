import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../js/presentation-content.js',import.meta.url),'utf8');
const setup=()=>{const c={};vm.runInNewContext(source,c);return c.PTPresentationContent;};
test('only PDFs and PowerPoint files are accepted',()=>{
 const scanner=setup();for(const name of ['talk.pdf','TALK.PPTX','talk.pptx'])assert.equal(scanner.supported(name),true);
 for(const name of ['report.docx','report.doc','talk.ppt','talk.pptx.exe','talk.pdf.html',''])assert.equal(scanner.supported(name),false);
});
test('PDF text scanning leaves original bytes untouched and does not rewrite page content',async()=>{
 const scanner=setup(),original=Buffer.from('%PDF original fonts and layout'),before=Buffer.from(original);let destroyed=false;
 const file={name:'talk.pdf',size:original.length,arrayBuffer:async()=>Uint8Array.from(original).buffer};
 const result=await scanner.scan(file,{pdf:{getDocument:({data})=>({promise:Promise.resolve({numPages:2,getPage:async i=>({getTextContent:async()=>({items:[{str:'Slide '+i},{str:'Original content'}]})}),destroy:()=>{destroyed=true;}})})}});
 assert.equal(result.text,'Slide 1 Original content\nSlide 2 Original content');assert.equal(result.pagesScanned,2);
 assert.deepEqual(original,before);assert.equal(destroyed,true);
});
test('scanning limits context size; image-only PDFs never invent content',async()=>{
 const scan=async items=>setup().scan({name:'talk.pdf',size:20,arrayBuffer:async()=>new ArrayBuffer(20)},{pdf:{getDocument:()=>({promise:Promise.resolve({numPages:150,getPage:async()=>({getTextContent:async()=>({items})})})})}});
 const large=await scan([{str:'a'.repeat(25000)}]);assert.equal(large.text.length,20000);assert.equal(large.truncated,true);
 assert.equal((await scan([])).text.trim(),'');
});
