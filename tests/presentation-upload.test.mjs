import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const code=await readFile(new URL('../js/cloud.js',import.meta.url),'utf8');
function setup(){
 const calls=[],P={};
 vm.runInNewContext(code.slice(code.indexOf("const BUCKET='presentations';"),code.indexOf('P.download=')),{P,sb:{storage:{from:bucket=>({upload:async(path,file,options)=>{calls.push({bucket,path,file,options});return{};}})}}});
 return {P,calls};
}
test('storage upload helper rejects DOCX and other extensions before contacting Storage',async()=>{
 const s=setup();
 for(const name of ['endorsement-letter-BSCS-2.docx','document.doc','legacy.ppt','file.exe','photo.png','archive.zip']){
  const result=await s.P.upload('user/'+name,{name,type:'application/octet-stream'});
  assert.match(result.error,/Only PPTX and PDF/);
 }
 assert.equal(s.calls.length,0);
});
test('PDF/PPTX storage requests use bucket-compatible MIME types and original file objects',async()=>{
 const s=setup();
 for(const [name,mime] of [['slides.pdf','application/pdf'],['slides.PPTX','application/vnd.openxmlformats-officedocument.presentationml.presentation']]){
  const file={name,type:''};assert.equal((await s.P.upload('user/'+name,file)).error,undefined);
  const sent=s.calls.at(-1);assert.equal(sent.options.contentType,mime);assert.equal(sent.file,file);
 }
 assert.ok((await s.P.upload('user/renamed.pptx',{name:'word.pptx',type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'})).error);
 assert.equal(s.calls.length,2);
});
