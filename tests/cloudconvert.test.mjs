import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHmac} from 'node:crypto';
import {Readable} from 'node:stream';
import {createPresentationConversion} from '../server/presentation-conversion.mjs';
import {createCloudConvertClient,ConversionError,exportUrl} from '../server/cloudconvert-client.mjs';
import {createCloudConvertWebhook} from '../api/cloudconvert-webhook.js';
import {createPresentationMaintenance} from '../api/presentation-maintenance.js';

const pdf=await readFile(new URL('../assets/library/confident-introductions.pdf',import.meta.url));
const user='11111111-1111-4111-8111-111111111111',id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const attempt='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',jobId='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
function setup(overrides={}){
  const calls=[],c={id,user_id:user,original_file_path:user+'/original.pptx',source_slides:5,state:'queued',reservation_settled:true,provider_deleted:false,next_attempt_at:'2000-01-01',...overrides};
  const job={id:jobId,tag:'pt-'+id+'-'+attempt,status:'finished',tasks:[{operation:'convert',status:'finished',credits:2},{name:'export-pdf',operation:'export/url',status:'finished',result:{files:[{filename:'presentation.pdf',url:'https://storage.cloudconvert.com/result.pdf'}]}}]};
  const saved=new Map();let total=0,reserved=0,presentation;
  const db={
    cache:async()=>({...c}),presentation:async()=>presentation,
    patchCache:async(key,token,patch)=>{Object.assign(c,patch);calls.push(['patch',patch]);return {...c}},
    patchPresentation:async(key,patch)=>Object.assign(presentation,patch),
    rpc:async(name,args)=>{
      calls.push([name,args]);
      if(name==='presentation_cloud_lock'){if(c.lock_token)return [];c.lock_token='lease';return [{...c}]}
      if(name==='presentation_cloud_reserve'){reserved+=2;Object.assign(c,{state:'starting',attempt_id:attempt,quota_day:'2026-11-18',reservation_settled:false});return true}
      if(name==='presentation_cloud_settle'){if(!c.reservation_settled){total+=args.p_credits;reserved-=2;c.reservation_settled=true}return true}
      if(name==='presentation_validation_claim')return [{...presentation,lease_token:'validation'}];
      if(name==='presentation_finish')Object.assign(presentation,{conversion_status:'completed',total_slides:args.p_pages});
      if(name==='presentation_cloud_bind')return id;
      return null;
    },
    json:async(route,options)=>{calls.push(['json',route,options]);return [{id:'reference'}]},
    sign:async(...args)=>{calls.push(['sign',...args]);return 'https://supabase.example/private?token=signed'},
    upload:async(name,bytes)=>{calls.push(['upload',name]);if(saved.has(name))return false;saved.set(name,bytes);return true},
    download:async(bucket,name)=>{calls.push(['download',bucket,name]);if(bucket==='presentation-originals')return pdf;if(!saved.has(name))throw Error('missing');return saved.get(name)},
    remove:async(...args)=>calls.push(['remove',...args])
  };
  const cloud={
    balance:async()=>{calls.push(['balance']);return 0},
    create:async(...args)=>{calls.push(['create',...args]);return job},
    find:async value=>{calls.push(['find',value]);return [job]},
    get:async()=>{calls.push(['get']);return job},
    remove:async()=>calls.push(['provider-delete']),
    download:async()=>{calls.push(['export-download']);return pdf}
  };
  const service=createPresentationConversion({storage:db,provider:cloud,log:{warn(){}}});
  return {service,c,db,cloud,job,calls,saved,get total(){return total},get reserved(){return reserved},setPresentation:p=>presentation=p,get presentation(){return presentation}};
}
test('a job stores a verified PDF, charges once, deletes provider files, and cached views use no credits',async()=>{
  const x=setup();await x.service.processCache(id);
  assert.equal(x.c.state,'processing');assert.equal(x.reserved,2);
  assert.equal(x.calls.filter(c=>c[0]==='create').length,1,'zero purchased balance does not reject free-account jobs');
  assert.equal(x.calls.find(c=>c[0]==='sign')[3],1200);
  await x.service.processCache(id);
  assert.equal(x.c.state,'completed');assert.equal(x.c.total_slides,5);assert.equal(x.total,2);assert.equal(x.reserved,0);
  assert.deepEqual(x.saved.get(user+'/cache/'+id+'.pdf'),pdf);assert.equal(x.c.provider_deleted,true);
  const before=x.calls.length;await x.service.processCache(id);
  assert.deepEqual(x.calls.slice(before).map(c=>c[0]),['presentation_cloud_sync']);
});
test('a lost POST response is reconciled by its saved tag without another conversion',async()=>{
  const x=setup();let sent=0;x.cloud.create=async()=>{sent++;throw Error('socket closed after submission')};
  assert.equal((await x.service.processCache(id)).busy,true);assert.ok(x.c.dispatch_started_at);assert.equal(x.c.provider_job_id,undefined);
  await x.service.processCache(id);assert.equal(sent,1);assert.equal(x.c.state,'completed');assert.equal(x.total,2);
  assert.equal(x.calls.filter(c=>c[0]==='find').length,1);
});
test('an ambiguous submission never blindly retries or spends another reservation',async()=>{
  const x=setup();let sent=0;x.cloud.create=async()=>{sent++;throw Error('lost response')};x.cloud.find=async()=>[];
  await x.service.processCache(id);await x.service.processCache(id);
  assert.equal(x.c.error_code,'confirming_job');assert.equal(x.reserved,2);
  x.c.dispatch_started_at=new Date(Date.now()-3601000).toISOString();await x.service.processCache(id);
  assert.equal(x.c.error_code,'submission_uncertain');assert.equal(x.c.retryable,false);assert.equal(sent,1);assert.equal(x.total,2);
});
test('quota waits until the next app day without starting another job or losing the original',async()=>{
  const x=setup();let sent=0;x.cloud.create=async()=>{sent++;throw new ConversionError('CREDITS_EXCEEDED',402)};
  await x.service.processCache(id);assert.equal(x.c.state,'queued');assert.equal(x.c.error_code,'daily_quota');
  assert.ok(Date.parse(x.c.next_attempt_at)>Date.now());assert.equal(x.c.attempt_id,null);assert.equal(x.total,0);assert.equal(x.reserved,0);
  await x.service.processCache(id);assert.equal(sent,1);assert.ok(!x.calls.some(c=>c[0]==='remove'));
});
test('rate limits are safely delayed; explicit authentication failures can be retried after setup',async()=>{
  for(const status of [429,401]){
    const x=setup();x.cloud.create=async()=>{throw new ConversionError('provider_error',status,120)};
    await x.service.processCache(id);assert.equal(x.total,0);assert.equal(x.reserved,0);assert.equal(x.c.dispatch_started_at,null);
    assert.equal(x.c.state,status===429?'queued':'failed');
    if(status===401){const before=x.calls.length;await x.service.processCache(id);assert.ok(!x.calls.slice(before).some(c=>c[0]==='find'))}
  }
});
test('an unverified CloudConvert email has an actionable message and releases the reserved credits',async()=>{
  const x=setup();x.cloud.create=async()=>{throw new ConversionError('FORBIDDEN',403,0,'email_unverified')};
  await x.service.processCache(id);
  assert.equal(x.c.error_code,'cloudconvert_email_unverified');assert.match(x.c.error,/email is not verified/);
  assert.equal(x.c.state,'failed');assert.equal(x.c.retryable,true);assert.equal(x.c.dispatch_started_at,null);
  assert.equal(x.c.provider_deleted,true);assert.equal(x.total,0);assert.equal(x.reserved,0);
  assert.equal(x.calls.filter(c=>c[0]==='export-download').length,0);
});
test('CloudConvert account errors are classified without exposing raw provider messages',async()=>{
  const messages=['Your email address is not verified.','Account blocked for PRIVATE_EMAIL at https://private.example?secret=PRIVATE_SECRET'];
  for(const message of messages){
    const client=createCloudConvertClient({env:{CLOUDCONVERT_API_KEY:' private-key\n'},fetchImpl:async(url,options)=>{
      assert.equal(options.headers.Authorization,'Bearer private-key');return Response.json({code:'FORBIDDEN',message},{status:403});
    }});
    await assert.rejects(client.create('test-tag','https://supabase.example/signed'),error=>{
      assert.equal(error.status,403);assert.equal(error.reason,message===messages[0]?'email_unverified':null);
      assert.doesNotMatch(error.message,/PRIVATE|https:|email address/);return true;
    });
  }
});
test('a cached file survives provider expiry and a temporary database publication failure',async()=>{
  const x=setup();await x.service.processCache(id);x.saved.set(user+'/cache/'+id+'.pdf',pdf);
  x.cloud.get=async()=>{throw new ConversionError('not_found',404)};
  const patch=x.db.patchCache;let failOnce=true;
  x.db.patchCache=async(...args)=>{if(args[2].state==='completed'&&failOnce){failOnce=false;throw Error('database timeout')}return patch(...args)};
  assert.equal((await x.service.processCache(id)).busy,true);assert.notEqual(x.c.state,'failed');
  await x.service.processCache(id);assert.equal(x.c.state,'completed');assert.equal(x.total,2);
});
test('incorrect slide counts are never published or automatically reconverted',async()=>{
  const x=setup({source_slides:4});await x.service.processCache(id);await x.service.processCache(id);
  assert.equal(x.c.state,'failed');assert.equal(x.c.error_code,'slide_count_mismatch');assert.equal(x.c.retryable,false);
  assert.equal(x.saved.size,0);assert.equal(x.c.provider_deleted,true);assert.equal(x.total,2);
});
test('PDF processing keeps original bytes and never calls CloudConvert or reserves credits',async()=>{
  const x=setup();x.setPresentation({id,user_id:user,file_type:'pdf',original_file_path:user+'/'+id+'.pdf',file_size:pdf.length,upload_completed:true,conversion_status:'queued'});
  await x.service.advance(id);assert.equal(x.presentation.conversion_status,'completed');assert.equal(x.presentation.total_slides,5);
  assert.equal(x.total,0);assert.ok(!x.calls.some(c=>['balance','create','export-download','presentation_cloud_reserve','upload'].includes(c[0])));
});
test('legacy PowerPoint is never sent to a third party before explicit consent',async()=>{
  const x=setup();x.setPresentation({id,file_type:'pptx',upload_completed:true,conversion_status:'queued'});
  await x.service.advance(id);assert.equal(x.presentation.error_code,'consent_required');assert.equal(x.calls.length,0);
});
test('parallel polling respects an existing claim',async()=>{
  const x=setup({lock_token:'another-request'});assert.deepEqual(await x.service.processCache(id),{busy:true});
  assert.ok(!x.calls.some(c=>c[0]==='create'));
});
test('CloudConvert requests keep credentials server-side and downloads reject unsafe hosts',async()=>{
  const calls=[];const client=createCloudConvertClient({env:{CLOUDCONVERT_API_KEY:'test-private-key'},fetchImpl:async(url,options)=>{calls.push([url,options]);return Response.json({data:{id:jobId}})}});
  await client.create('saved-tag','https://supabase.example/signed');const body=JSON.parse(calls[0][1].body);
  assert.equal(body.tasks['convert-pdf'].engine,'office');assert.equal(body.tasks['convert-pdf'].timeout,60);
  assert.equal(calls[0][1].headers.Authorization,'Bearer test-private-key');assert.equal(calls[0][1].redirect,'error');
  await client.download('https://storage.cloudconvert.com/task/file.pdf?signature=temporary',1000);
  assert.equal(calls[1][1].headers,undefined);assert.equal(calls[1][1].redirect,'error');
  for(const url of ['http://storage.cloudconvert.com/file','https://storage.cloudconvert.com.evil.test/file','https://127.0.0.1/file','https://user@storage.cloudconvert.com/file','https://storage.cloudconvert.com:9999/file','file:///etc/passwd'])assert.throws(()=>exportUrl(url));
});
test('webhook verifies exact raw bytes, ignores unknown events, and retries transient failures',async()=>{
  const secret='test-signing-secret',seen=[];const handler=createCloudConvertWebhook({env:{CLOUDCONVERT_WEBHOOK_SECRET:secret},conversion:{webhook:async job=>{seen.push(job);return {busy:true}}}});
  const run=async(raw,signature)=>{const req=Readable.from([raw.subarray(0,5),raw.subarray(5)]);req.method='POST';req.headers={'cloudconvert-signature':signature};const res={setHeader(){},end(body){this.body=JSON.parse(body)}};await handler(req,res);return res};
  const raw=Buffer.from('{ "event": "job.finished", "job": {"id":"'+jobId+'"} }'),sig=createHmac('sha256',secret).update(raw).digest('hex');
  assert.equal((await run(raw,sig)).statusCode,503);assert.equal(seen.length,1);
  assert.equal((await run(Buffer.from(raw.toString().replace('finished','failed')),sig)).statusCode,401);assert.equal(seen.length,1);
  assert.equal((await run(raw,'invalid')).statusCode,401);
});
test('daily maintenance requires the configured bearer secret',async()=>{
  let calls=0;const secret='x'.repeat(40),handler=createPresentationMaintenance({env:{CRON_SECRET:secret},conversion:{maintain:async()=>{calls++;return {checked:true}}}});
  for(const [authorization,status] of [['',401],['Bearer wrong',401],['Bearer '+secret,200]]){
    const res={setHeader(){},end(){}};await handler({method:'GET',headers:{authorization}},res);assert.equal(res.statusCode,status);
  }
  assert.equal(calls,1);
});
