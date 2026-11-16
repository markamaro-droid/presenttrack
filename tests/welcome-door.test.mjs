import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../js/welcome-door.js',import.meta.url),'utf8');
const robot=await readFile(new URL('../js/robot.js',import.meta.url),'utf8');
const copy="Let's dive into your speaking evaluation. Follow me inside, and we'll take it one step at a time.";

function setup({reducedMotion=false,voice=true,narration=true,throwSpeech=false}={}){
  const elements=new Map(),timers=new Map(),listeners=new Map(),animations=[],poses=[];
  let now=0,timerId=0,speech=null,narrations=0,cancellations=0,navigations=0;
  const document={hidden:false,activeElement:null};
  function element(id,rect={left:0,top:0,width:220,height:240}){
    const classes=new Set(),children=new Map(),attributes=new Map();
    return {id,hidden:false,inert:false,style:{overflow:'auto'},dataset:{},tabIndex:0,
      classList:{add:(...names)=>names.forEach(n=>classes.add(n)),remove:(...names)=>names.forEach(n=>classes.delete(n)),contains:n=>classes.has(n)},
      getBoundingClientRect:()=>rect,
      setAttribute:(name,value)=>attributes.set(name,value),removeAttribute:name=>attributes.delete(name),
      appendChild(child){child.parentElement=this;if(child.id)elements.set(child.id,child);},
      remove(){if(elements.get(this.id)===this)elements.delete(this.id);this.removed=true;},
      querySelector(selector){
        if(!children.has(selector))children.set(selector,element(selector,selector==='.welcome-door-actor'?{left:470,top:200,width:218,height:230}:{left:180,top:180,width:164,height:260}));
        return children.get(selector);
      },
      querySelectorAll(selector){return selector.split(',').map(s=>this.querySelector(s));},
      focus(){document.activeElement=this;},
      animate(frames,options){const animation={element:this,frames,options,cancelled:false,cancel(){this.cancelled=true;}};animations.push(animation);return animation;}
    };
  }
  ['bot','land','leval','bc','app'].forEach(id=>elements.set(id,element(id)));
  elements.get('app').hidden=true;
  document.body=element('body');
  document.getElementById=id=>elements.get(id)||null;
  document.createElement=()=>element('');
  document.querySelector=()=>element('heading');
  document.addEventListener=(type,fn)=>listeners.set(type,fn);
  document.removeEventListener=(type,fn)=>{if(listeners.get(type)===fn)listeners.delete(type);};
  const podium={voiceOn:voice,welcomeStop(){},hushNow(){},robotDoorPose:pose=>poses.push(pose)};
  if(narration)podium.robotDoorNarrate=(text,hooks)=>{
    narrations++;if(throwSpeech)throw Error('unavailable');
    speech={text,...hooks};return{cancel(){cancellations++;}};
  };
  const context={podium,document,PTWelcomeDoorSpeech:{text:copy},matchMedia:()=>({matches:reducedMotion}),
    window:{addEventListener:(type,fn)=>listeners.set(type,fn),removeEventListener:(type,fn)=>{if(listeners.get(type)===fn)listeners.delete(type);}},
    getComputedStyle:()=>({backgroundColor:'rgb(29,78,216)',transform:'none'}),
    setTimeout(fn,ms){const id=++timerId;timers.set(id,{at:now+ms,fn});return id;},clearTimeout:id=>timers.delete(id)};
  vm.runInNewContext(source,context);
  const advance=ms=>{
    const end=now+ms;
    while(true){const next=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;
      const [id,timer]=next;now=timer.at;timers.delete(id);timer.fn();}
    now=end;
  };
  return{podium,elements,timers,listeners,animations,poses,advance,
    start:()=>podium.welcomeEnter(()=>{navigations++;elements.get('app').hidden=false;}),
    get overlay(){return elements.get('welcome-door');},
    get speech(){return speech;},get narrations(){return narrations;},get cancellations(){return cancellations;},get navigations(){return navigations;}};
}

test('door forms from the button before narration; approach follows playback and entry follows its end',()=>{
  const s=setup();assert.equal(s.start(),true);
  assert.equal(s.overlay.dataset.phase,'forming');assert.equal(s.narrations,0);
  assert.equal(s.elements.get('land').inert,true);
  assert.equal(s.animations.find(a=>a.element.id==='.welcome-door-frame').frames[0].backgroundColor,'rgb(29,78,216)');
  s.advance(849);assert.equal(s.narrations,0);s.advance(1);
  assert.equal(s.narrations,1);assert.equal(s.speech.text,copy);
  assert.equal(s.overlay.dataset.phase,'speaking');
  const before=s.animations.length;s.speech.onstart();assert.equal(s.animations.length,before+1);
  assert.equal(s.animations.at(-1).options.duration,3000);
  s.advance(700);assert.equal(s.poses.at(-1),'turn');assert.equal(s.navigations,0);
  s.speech.onend();assert.equal(s.overlay.dataset.phase,'entering');assert.equal(s.poses.at(-1),'enter');
  s.advance(1649);assert.equal(s.navigations,0);s.advance(1);assert.equal(s.navigations,1);
  assert.equal(s.elements.get('land').inert,false);assert.equal(s.elements.get('bc').tabIndex,0);
  s.advance(380);assert.equal(s.overlay,undefined);assert.equal(s.timers.size,0);
});

test('muted or unavailable narration keeps readable captions, then completes without audio',()=>{
  for(const options of [{voice:false},{narration:false},{throwSpeech:true}]){
    const s=setup(options);s.start();s.advance(850);
    assert.equal(s.overlay.querySelector('.welcome-door-caption').textContent,copy);
    s.advance(2399);assert.equal(s.overlay.dataset.phase,'speaking');s.advance(1);
    assert.equal(s.overlay.dataset.phase,'entering');s.advance(1650);assert.equal(s.navigations,1);
  }
});

test('failed, blocked, and stalled playback have bounded caption fallbacks',()=>{
  for(const reason of ['failed','loading','stalled']){
    const s=setup();s.start();s.advance(850);
    if(reason==='failed')s.speech.onerror();
    if(reason==='loading')s.advance(4000);
    if(reason==='stalled'){s.speech.onstart();s.advance(16000);}
    s.speech.onstart();s.speech.onend();
    assert.equal(s.overlay.dataset.phase,'speaking','late speech callbacks cannot bypass caption reading time');
    s.advance(2400);assert.equal(s.overlay.dataset.phase,'entering');
    s.advance(1650);assert.equal(s.navigations,1);s.advance(100000);assert.equal(s.navigations,1);
  }
});

test('repeat clicks do not create another narration or transition',()=>{
  const s=setup();s.start();assert.equal(s.start(),false);s.advance(850);assert.equal(s.start(),false);
  assert.equal(s.narrations,1);s.speech.onstart();s.speech.onend();s.speech.onend();
  s.advance(10000);assert.equal(s.navigations,1);assert.equal(s.narrations,1);
});

test('cancel releases the model, listeners and timers; stale callbacks cannot navigate',()=>{
  for(const duringSpeech of [false,true]){
    const s=setup();s.start();if(duringSpeech){s.advance(850);s.speech.onstart();}
    s.podium.welcomeEnterCancel();
    assert.equal(s.overlay,undefined);assert.equal(s.podium.welcomeEntering(),false);
    assert.equal(s.elements.get('bot').parentElement.id,'body');
    assert.equal(s.elements.get('land').inert,false);assert.equal(s.listeners.size,0);assert.equal(s.timers.size,0);
    s.speech?.onstart();s.speech?.onend();s.speech?.onerror();s.advance(100000);
    assert.equal(s.navigations,0);
  }
});

test('Skip and Escape navigate once and ignore late narration completion',()=>{
  for(const escape of [false,true]){
    const s=setup();s.start();s.advance(850);s.speech.onstart();
    if(escape)s.listeners.get('keydown')({key:'Escape',preventDefault(){},stopPropagation(){}});
    else s.overlay.querySelector('[data-door-skip]').onclick();
    assert.equal(s.navigations,1);s.speech.onstart();s.speech.onend();s.speech.onerror();s.advance(100000);
    assert.equal(s.navigations,1);assert.equal(s.overlay,undefined);assert.equal(s.listeners.size,0);
  }
});

test('reduced motion removes movement but still waits for actual speech to finish',()=>{
  const s=setup({reducedMotion:true});s.start();s.advance(120);
  assert.equal(s.narrations,1);assert.equal(s.animations.length,0);
  s.speech.onstart();s.advance(2000);assert.equal(s.navigations,0);assert.equal(s.animations.length,0);
  s.speech.onend();s.advance(149);assert.equal(s.navigations,0);s.advance(1);assert.equal(s.navigations,1);
  s.advance(120);assert.equal(s.overlay,undefined);
});

test('robot doorway gestures follow voice hooks and cancellation suppresses callbacks',()=>{
  let playback,done,hushed=0;const states=[],events=[];
  const context={podium:{},nar:{started:false,failed:false},clearAll(){},stopVoice(){},set:n=>states.push(n),hush:()=>hushed++,speak:(text,finish,hooks)=>{done=finish;playback=hooks;}};
  vm.runInNewContext(robot.slice(robot.indexOf('podium.robotDoorNarrate='),robot.indexOf('podium.robotDoorPose=')),context);
  const handle=context.podium.robotDoorNarrate(copy,{onstart:()=>events.push('start'),onend:()=>events.push('end'),onerror:()=>events.push('error')});
  assert.deepEqual(states,['idle']);context.nar.started=true;playback.onstart();assert.equal(states.at(-1),'talking');
  playback.onpause();assert.equal(states.at(-1),'idle');
  handle.cancel();playback.onstart();done();assert.deepEqual(events,['start']);assert.equal(hushed,1);
  context.nar.started=false;context.podium.robotDoorNarrate(copy,{onerror:()=>events.push('error')});done();
  assert.deepEqual(events,['start','error']);
});
