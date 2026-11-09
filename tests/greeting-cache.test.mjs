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
  const create=()=>{const context={caches:storage,Response,Date:{now:()=>now}};vm.runInNewContext(source,context);return context.PTGreeting;};
  return {rows,create,advance:()=>now+=8*86400000};
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
