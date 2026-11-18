import test from 'node:test';
import assert from 'node:assert/strict';
import {createPresentationStorage} from '../server/presentation-storage.mjs';
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
test('server storage errors distinguish rejected keys, permissions, missing schema and transient failures without exposing private details',async()=>{
  for(const [status,code,expected] of [[401,undefined,'storage_credentials_rejected'],[401,'PGRST301','storage_credentials_rejected'],[403,'42501','storage_permissions'],[400,'PGRST204','storage_schema_missing'],[404,'PGRST202','storage_schema_missing'],[404,'42P01','storage_schema_missing'],[500,'XX000','storage_unavailable']]){
    const logs=[],storage=createPresentationStorage({env:{SUPABASE_URL:'https://project.example',SUPABASE_SERVICE_ROLE_KEY:'private-server-key'},log:{warn:line=>logs.push(line)},fetchImpl:async()=>Response.json({code,message:'private-server-key PRIVATE_USER_DATA',details:'PRIVATE_FILE_PATH'}, {status})});
    await assert.rejects(storage.patchPresentation(id,{conversion_consent_at:new Date().toISOString()}),error=>error.code===expected&&!/PRIVATE|private-server-key/.test(error.message));
    assert.deepEqual(JSON.parse(logs[0]),{event:'presentation_storage_error',operation:'presentations',status,...(code?{code}:{})});
    assert.doesNotMatch(logs.join(''),/PRIVATE|private-server-key|aaaaaaaa/);
  }
});
test('copied surrounding whitespace is removed from server configuration',async()=>{
  const calls=[],storage=createPresentationStorage({env:{SUPABASE_URL:' https://project.example/\n',SUPABASE_SERVICE_ROLE_KEY:' private-key\n'},fetchImpl:async(url,options)=>{calls.push([url,options.headers]);return Response.json([])}});
  await storage.cache(id);assert.ok(calls[0][0].startsWith('https://project.example/rest/'));assert.equal(calls[0][1].apikey,'private-key');assert.equal(calls[0][1].Authorization,'Bearer private-key');
});
test('missing buckets and unexpected or oversized error bodies produce safe messages',async()=>{
  for(const [response,expected] of [[Response.json({code:'NoSuchBucket'},{status:404}),'storage_bucket_missing'],[new Response('PRIVATE '.repeat(10000),{status:502}),'storage_unavailable'],[Response.json({code:'private-server-key',message:'PRIVATE'},{status:400}),'storage_unavailable']]){
    const logs=[],storage=createPresentationStorage({env:{SUPABASE_URL:'https://project.example',SUPABASE_SERVICE_ROLE_KEY:'private-key'},log:{warn:line=>logs.push(line)},fetchImpl:async()=>response});
    await assert.rejects(storage.json('/storage/v1/object/list/presentation-previews',{method:'POST',body:{prefix:'PRIVATE_FILE_PATH'}}),error=>error.code===expected);
    assert.doesNotMatch(logs.join(''),/PRIVATE|private-server-key/);
  }
});
