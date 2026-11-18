import test from 'node:test';
import assert from 'node:assert/strict';
import {createPresentationsService,validatePresentationRequest} from '../server/presentations.mjs';
import {createPresentationsHandler} from '../api/presentations.js';
const user='11111111-1111-4111-8111-111111111111',id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const env={SUPABASE_URL:'https://storage.example',SUPABASE_ANON_KEY:'public',SUPABASE_SERVICE_ROLE_KEY:'private-storage',CLOUDCONVERT_API_KEY:'private-converter'};
function setup({missing=false,anonymous=false,type='pptx',status='completed'}={}){
  const calls=[],row={id,user_id:user,original_filename:'talk.'+type,original_file_path:`${user}/${id}.${type}`,file_type:type,conversion_status:status,preview_pdf_path:`${user}/${id}/preview.pdf`,lease_token:'never-return',conversion_consent_at:new Date().toISOString()};
  const progressed=[],conversion={advance:async id=>progressed.push(id),retry:async()=>true,cleanupDeleted:async()=>{},db:{patchPresentation:async(id,patch)=>[{...row,...patch}]}};
  const service=createPresentationsService({env,conversion,log:{warn(){}},fetchImpl:async(url,options)=>{
    calls.push({url,...options});
    if(url.endsWith('/auth/v1/user'))return Response.json({id:user,is_anonymous:anonymous});
    if(url.includes('/storage/v1/object/sign/'))return Response.json({signedURL:'/object/sign/private?token=short-lived'});
    if(url.includes('/rpc/'))return Response.json(row);
    assert.match(url,new RegExp('user_id=eq.'+user));return Response.json(missing?[]:[Object.fromEntries(Object.entries(row).filter(([k])=>!['user_id','lease_token'].includes(k)))]);
  }});
  return {service,calls,progressed};
}
test('presentation input rejects unsafe files, IDs and excessive sizes',()=>{
  const valid={action:'create',id,title:'Talk',filename:'talk.pptx',type:'pptx',size:100};
  assert.equal(validatePresentationRequest(valid),valid);
  for(const patch of [{id:'../escape'},{filename:'../talk.pptx'},{filename:'talk.pptm'},{filename:'bad\u0000.pptx'},{size:50000001},{size:0},{title:'x'},{type:'exe'}])assert.throws(()=>validatePresentationRequest({...valid,...patch}));
});
test('authentication and ownership precede every private operation',async()=>{
  const {service,calls}=setup();await assert.rejects(service('',{action:'status',id}),e=>e.status===401);assert.equal(calls.length,0);
  await assert.rejects(setup({anonymous:true}).service('Bearer jwt',{action:'status',id}),e=>e.status===401);
  for(const action of ['status','retry','submit','delete','download']){
    const isolated=setup({missing:true});await assert.rejects(isolated.service('Bearer jwt',{action,id,kind:'original'}),e=>e.status===404);
    assert.equal(isolated.calls.length,2);
  }
});
test('submit advances only the authenticated presentation and never exposes backend secrets',async()=>{
  const {service,calls,progressed}=setup();const result=await service('Bearer jwt',{action:'submit',id,url:'https://untrusted.example',userId:'forged'});
  assert.equal(result.presentation.id,id);assert.equal(result.presentation.lease_token,undefined);
  assert.deepEqual(progressed,[id]);assert.equal(calls.find(x=>x.url.includes('/rpc/')).headers.Authorization,'Bearer jwt');
});
test('PowerPoint requires disclosure consent; PDF creation does not',async()=>{
  const {service}=setup();const body={action:'create',id,title:'Talk',filename:'talk.pptx',type:'pptx',size:100};
  await assert.rejects(service('Bearer jwt',body),e=>e.code==='conversion_consent_required');
  assert.equal((await service('Bearer jwt',{...body,cloudconvertConsent:true})).presentation.id,id);
  assert.equal((await setup({type:'pdf'}).service('Bearer jwt',{...body,type:'pdf',filename:'talk.pdf'})).presentation.id,id);
});
test('signed downloads use only owned database paths; PDFs use original bytes',async()=>{
  for(const type of ['pdf','pptx']){
    const {service,calls}=setup({type});const result=await service('Bearer jwt',{action:'download',id,kind:'preview',path:'other-user/file',url:'https://untrusted'});
    assert.equal(result.filename,'talk.pdf');assert.equal(result.expiresIn,300);
    assert.match(calls.at(-1).url,new RegExp(type==='pdf'?'presentation-originals':'presentation-previews'));
    assert.equal(JSON.parse(calls.at(-1).body).expiresIn,300);
  }
  await assert.rejects(setup({status:'queued'}).service('Bearer jwt',{action:'download',id,kind:'preview'}),e=>e.status===409);
});
test('presentation HTTP boundary rejects malformed and oversized bodies',async()=>{
  const handler=createPresentationsHandler(async()=>({ok:true}));
  const run=async(body,method='POST',content='application/json')=>{const res={setHeader(){},end(value){this.body=JSON.parse(value)}};await handler({method,headers:{'content-type':content},body},res);return res.statusCode};
  assert.equal(await run('{}','GET'),405);assert.equal(await run('{}','POST','text/plain'),415);
  assert.equal(await run('x'.repeat(4097)),413);assert.equal(await run('{broken'),400);assert.equal(await run({action:'list'}),200);
});
