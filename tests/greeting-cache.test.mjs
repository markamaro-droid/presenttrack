import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../js/greeting-cache.js',import.meta.url),'utf8');
const speech=await readFile(new URL('../js/cartesia-speech.js',import.meta.url),'utf8');
const valid={audio:'UklGRnRlc3Q=',mime:'audio/wav',privateField:'must not persist'};
function setup(){
  const rows=new Map(); let now=1000;
  const storage={open:async()=>({match:async key=>rows.get(key)?.clone(),put:async(key,value)=>rows.set(key,value),delete:async key=>rows.delete(key)})};
  const create=(clip='PTGreeting')=>{const context={caches:storage,Response,Date:{now:()=>now}};vm.runInNewContext(source,context);return context[clip];};
  return {rows,storage,create,advance:()=>now+=8*86400000};
}
test('generic greeting survives reload, stores no extra fields, and expires',async()=>{
  const s=setup();await s.create().write(valid);
  const greeting=s.create();assert.deepEqual(Object.keys(await greeting.read()).sort(),['audio','mime']);
  s.advance();assert.equal(await greeting.read(),null);assert.equal(s.rows.size,0);
});
test('corrupt audio and unavailable storage are harmless cache misses',async()=>{
  const s=setup();await s.create().write({audio:'bad',mime:'audio/wav'});assert.equal(s.rows.size,0);
  const context={};vm.runInNewContext(source,context);
  await context.PTGreeting.write(valid);assert.equal(await context.PTGreeting.read(),null);
  await context.PTWelcomeDoorSpeech.write(valid);assert.equal(await context.PTWelcomeDoorSpeech.read(),null);
});

test('doorway narration has its own fixed cache entry, strips extra fields, and expires',async()=>{
  const s=setup(),greeting=s.create(),door=s.create('PTWelcomeDoorSpeech');
  assert.equal(door.text,"Let's dive into your speaking evaluation. Follow me inside, and we'll take it one step at a time.");
  await greeting.write(valid);
  const doorAudio={...valid,audio:'UklGRmRvb3I='};await door.write(doorAudio);
  assert.equal(s.rows.size,2);
  assert.equal((await greeting.read()).audio,valid.audio);
  assert.equal((await s.create('PTWelcomeDoorSpeech').read()).audio,doorAudio.audio);
  assert.deepEqual(Object.keys(await door.read()).sort(),['audio','mime']);
  s.advance();assert.equal(await door.read(),null);assert.equal(s.rows.size,1);
});
test('only authenticated fixed greetings read persistent audio; conversations still fetch',async()=>{
  let reads=0,fetches=0;
  const context={AbortController,Uint8Array,Blob,atob,setTimeout,clearTimeout,addEventListener(){},
    PTGreeting:{text:'Fixed greeting',read:async()=>{reads++;return valid;},write:async()=>{}},
    PTCloud:{user:{id:'alice'},client:{auth:{getSession:async()=>({data:{session:{user:{id:'alice'},access_token:'test'}}})}}},
    fetch:async()=>{fetches++;return new Response(JSON.stringify(valid));}};
  vm.runInNewContext(speech,context);
  assert.equal(await context.TracyAudio.prepare('Fixed greeting'),true);
  assert.equal(reads,1);assert.equal(fetches,0);
  await context.TracyAudio.prepare('Private conversation');assert.equal(reads,1);assert.equal(fetches,1);
  context.PTCloud.user=null;
  assert.equal(await context.TracyAudio.prepare('Fixed greeting'),false);assert.equal(reads,1);
});

test('door speech is generated once, then a fresh page session reuses device audio',async()=>{
  const s=setup();let requests=0;
  const create=()=>{
    const context={caches:s.storage,Response,AbortController,Uint8Array,Blob,atob,setTimeout,clearTimeout,addEventListener(){},
      PTCloud:{user:{id:'alice'},client:{auth:{getSession:async()=>({data:{session:{user:{id:'alice'},access_token:'test'}}})}}},
      fetch:async()=>{requests++;return new Response(JSON.stringify(valid));}};
    vm.runInNewContext(source+'\n'+speech,context);return context;
  };
  const first=create();assert.equal(await first.TracyAudio.prepare(first.PTWelcomeDoorSpeech.text),true);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(requests,1);assert.equal(s.rows.size,1);
  const reloaded=create();assert.equal(await reloaded.TracyAudio.prepare(reloaded.PTWelcomeDoorSpeech.text),true);
  assert.equal(requests,1,'repeated fixed narration makes no provider request after reload');
  await reloaded.TracyAudio.prepare(reloaded.PTWelcomeDoorSpeech.text+' Your private score is 70.');
  assert.equal(requests,2);assert.equal(s.rows.size,1,'dynamic continuations do not persist');
  await reloaded.TracyAudio.prepare(reloaded.PTWelcomeDoorSpeech.text,'fil-PH');
  assert.equal(requests,3);assert.equal(s.rows.size,1,'other languages do not reuse the English clip');
});

test('a mismatched session or account change cannot use cached doorway audio',async()=>{
  let reads=0,resolveRead;
  const context={AbortController,Uint8Array,Blob,atob,setTimeout,clearTimeout,addEventListener(){},
    PTWelcomeDoorSpeech:{text:'Fixed doorway',read:()=>{reads++;return new Promise(resolve=>resolveRead=resolve);},write:async()=>{}},
    PTCloud:{user:{id:'bob'},client:{auth:{getSession:async()=>({data:{session:{user:{id:'alice'},access_token:'test'}}})}}},
    fetch:async()=>{throw Error('No fetch expected');}};
  vm.runInNewContext(speech,context);
  assert.equal(await context.TracyAudio.prepare('Fixed doorway'),false);assert.equal(reads,0);
  context.PTCloud.user={id:'alice'};
  const preparing=context.TracyAudio.prepare('Fixed doorway');await new Promise(resolve=>setImmediate(resolve));
  assert.equal(reads,1);context.PTCloud.user={id:'bob'};resolveRead(valid);
  assert.equal(await preparing,false,'late cache reads cannot cross an account switch');
});
