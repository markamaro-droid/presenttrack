import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createLearningService} from '../server/learning.mjs';
import {createPracticeService} from '../server/practice.mjs';
import {memoryContext,rememberConversation} from '../server/tracy-memory.mjs';
import {deleteLearningAccount} from '../server/learning-account.mjs';
import {extractSlides,prepareUnderstanding} from '../server/presentation-understanding.mjs';
import {audioResult,explanation,result} from './fixtures/learning.mjs';
const user=randomUUID(),foreign=randomUUID(),presentationId=randomUUID();
const env={SUPABASE_URL:'https://database.test',SUPABASE_ANON_KEY:'anon-test',SUPABASE_SERVICE_ROLE_KEY:'service-test',GROQ_API_KEY:'groq-test',GEMINI_API_KEY:'gemini-test'};
const understanding={topic:'Study habits',objectives:[],slides:[{number:1,title:'Study habits',mainPoints:['Healthy study habits support learning.'],terminology:[],examples:[]}],limitations:[]};

test('learning API verifies auth, ignores forged identity, scopes reads and refuses foreign records',async()=>{
  const calls=[];
  const service=createLearningService({env,fetchImpl:async(url,options)=>{calls.push(url);if(url.endsWith('/auth/v1/user'))return options.headers.Authorization==='Bearer valid'?Response.json({id:user}):new Response('',{status:401});assert.equal(new URL(url).searchParams.get('user_id'),'eq.'+user);return Response.json([])}});
  await assert.rejects(service('',{action:'history'}),e=>e.status===401);assert.equal(calls.length,0);
  assert.deepEqual(await service('Bearer valid',{action:'history',userId:foreign}),{sessions:[],deleted:[]});
  await assert.rejects(service('Bearer valid',{action:'review',id:randomUUID()}),e=>e.status===404);
  await assert.rejects(service('Bearer valid',{action:'prepare',id:randomUUID()}),e=>e.status===404);
  await assert.rejects(service('Bearer valid',{action:'save-memory',content:'Unapproved preference'}),e=>e.code==='invalid_memory');
  await assert.rejects(service('Bearer valid',{action:'preferences',preferences:{conversation_history:true,retention_days:999}}),e=>e.code==='invalid_preferences');
});

test('durable practice saves both dimensions, retains delivery on AI failure and reuses a completed session',async()=>{
  for(const failExplanation of [false,true]){
    let saved=null,providerCalls=0;const sessionId=randomUUID();
    const fetchImpl=async(url,options)=>{
      if(url.includes('/rest/v1/')){
        const u=new URL(url),table=u.pathname.split('/').at(-1);if(!u.pathname.includes('/rpc/'))assert.equal(u.searchParams.get('user_id'),'eq.'+user);
        if(table==='learning_sessions')return Response.json(saved?[saved]:[]);
        if(table==='learning_preferences')return Response.json([{pause_threshold:3}]);
        if(table==='presentations')return Response.json([{id:presentationId,title:'Study habits',user_id:user}]);
        if(table==='presentation_understanding')return Response.json([{status:'completed',analysis:understanding}]);
        if(table==='save_learning_session'){const b=JSON.parse(options.body);assert.equal(b.p_user,user);saved={id:b.p_id,kind:'practice',result:b.p_result};return Response.json(saved)}
        throw Error('Unexpected database operation '+table);
      }
      providerCalls++;
      if(url.endsWith('/transcriptions'))return Response.json(audioResult);
      if(url.includes('generativelanguage'))return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({transcript:audioResult.text})}]}}]});
      const input=JSON.parse(options.body);assert.equal(input.response_format.type,'json_schema');assert.equal(input.response_format.json_schema.strict,true);
      return failExplanation?new Response('',{status:503}):Response.json({choices:[{message:{content:JSON.stringify(explanation())}}]});
    };
    const service=createPracticeService({env,fetchImpl,access:{authenticate:async()=>({userId:user}),quota:async()=>{}}});
    const input={sessionId,presentationId,audio:Buffer.from('fixture-audio').toString('base64'),mime:'audio/webm',consent:true,target:120,slideNavigation:[{at:0,slide:1}]};
    const report=await service('Bearer valid',input);assert.equal(report.persisted,true);assert.equal(report.explanationQuality.status,failExplanation?'failed':'completed');assert.equal(report.criteriaVersion,'delivery-v2');assert.equal(report.dims.pauses.scored,false);assert.equal(report.metrics.pauseThreshold,3);assert.equal(report.slideAlignment.segments[0].slide,1);
    assert.ok(saved.result.metrics.words>0);const before=providerCalls;
    assert.deepEqual(await service('Bearer valid',input),report);assert.equal(providerCalls,before,'retry must not retranscribe a completed session');
  }
});

test('Tracy retrieves only bounded owner records and saves a turn only with current consent',async()=>{
  let consent=true,writeCount=0;const sample=result();
  const fetchImpl=async(url,options)=>{const u=new URL(url),table=u.pathname.split('/').at(-1);
    if(table==='save_tracy_conversation'){const body=JSON.parse(options.body);assert.equal(body.p_user,user);writeCount++;return Response.json(consent)}
    assert.equal(u.searchParams.get('user_id'),'eq.'+user,'service-role queries must include owner');
    if(table==='learning_preferences')return Response.json([{conversation_history:consent,retention_days:30,coaching_style:'Specific'}]);
    if(table==='learning_sessions')return Response.json([{id:randomUUID(),kind:'practice',title:'Study habits',result:sample}]);
    if(table==='tracy_memories')return Response.json(Array.from({length:12},(_,i)=>({content:'Study preference '+i,source:'user-approved'})));
    if(table==='tracy_conversations')return Response.json(options.method==='DELETE'?[]:[{question:'Help study examples',answer:'Use a concrete example.',created_at:new Date().toISOString()},{question:'Unrelated conversation',answer:'Unrelated'}]);
    if(table==='presentations')return Response.json([{id:presentationId,user_id:user}]);
    if(table==='presentation_understanding')return Response.json([{status:'completed',analysis:understanding}]);
    throw Error(table);
  };
  const memory=await memoryContext(user,'study examples',{env,fetchImpl,presentationId});
  assert.equal(memory.context.priorConversations.length,1);assert.equal(memory.context.approvedMemories.length,8);assert.equal(memory.context.presentation.topic,'Study habits');assert.equal(JSON.stringify(memory.context).includes(audioResult.text),false,'raw historical transcripts must not be sent');
  assert.equal(await rememberConversation(user,'Help','Try a practical example',memory.preferences,{env,fetchImpl}),'saved');
  consent=false;assert.equal(await rememberConversation(user,'Help','Try again',memory.preferences,{env,fetchImpl}),'disabled');assert.equal(writeCount,1);
});

test('account deletion checks password and restricts file cleanup to the authenticated user',async()=>{
  const calls=[];let passwordValid=false;
  const fetchImpl=async(url,options)=>{calls.push({url,options});if(url.endsWith('/auth/v1/user'))return Response.json({id:user,email:'fixture@example.test'});if(url.includes('/token?'))return passwordValid?Response.json({user:{id:user}}):new Response('',{status:400});if(url.includes('/object/list/')){assert.equal(JSON.parse(options.body).prefix,user);return Response.json([])}if(url.includes('/auth/v1/admin/users/')){assert.ok(url.endsWith(user));return Response.json({})}throw Error('Unexpected deletion')};
  await assert.rejects(deleteLearningAccount(user,'Bearer valid',{confirmation:'DELETE',password:'wrong'},{env,fetchImpl}),e=>e.code==='password_required');assert.equal(calls.some(c=>c.options.method==='DELETE'),false);
  passwordValid=true;assert.deepEqual(await deleteLearningAccount(user,'Bearer valid',{confirmation:'DELETE',password:'test-password'},{env,fetchImpl}),{deleted:true});
});

test('PDF content comes from the original private PDF and completed understanding is reused',async()=>{
  const bytes=await readFile(new URL('../assets/library/confident-introductions.pdf',import.meta.url));
  const content=await extractSlides({file_type:'pdf',original_file_path:user+'/original.pdf'},{env,fetchImpl:async()=>new Response(bytes)});
  assert.equal(content.slides.length,5);assert.match(content.slides[0].text,/introduction/i);
  const saved={status:'completed',analysis:understanding};
  assert.equal(await prepareUnderstanding({presentation:async()=>({upload_completed:true}),list:async()=>[saved]},user,presentationId,{env,fetchImpl:async()=>{throw Error('Cached content must not call an AI provider')}}),saved);
});
