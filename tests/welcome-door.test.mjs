import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../js/welcome-door.js',import.meta.url),'utf8');
const robot=await readFile(new URL('../js/robot.js',import.meta.url),'utf8');
const copy="Let's dive into your speaking evaluation. Follow me inside, and we'll take it one step at a time.";
const returningCopy="Welcome back! Let's pick up where you left off. Your dashboard is ready.";

function setup({reducedMotion=false,voice=true,narration=true,throwSpeech=false,returning=false,fromLogin=false}={}){
  const elements=new Map(),timers=new Map(),listeners=new Map(),animations=[],poses=[];
  let now=0,timerId=0,speech=null,narrations=0,cancellations=0,navigations=0;
  const document={hidden:false,activeElement:null,documentElement:{clientWidth:1440}};
  function element(id,rect={left:0,top:0,width:220,height:240}){
    const classes=new Set(),children=new Map(),attributes=new Map();
    return {id,hidden:false,inert:false,style:{overflow:'auto'},dataset:{},tabIndex:0,
      classList:{add:(...names)=>names.forEach(n=>classes.add(n)),remove:(...names)=>names.forEach(n=>classes.delete(n)),contains:n=>classes.has(n)},
      getBoundingClientRect:()=>rect,
      setAttribute:(name,value)=>attributes.set(name,value),removeAttribute:name=>attributes.delete(name),
      appendChild(child){child.parentElement=this;if(child.id)elements.set(child.id,child);},
      before(child){child.parentElement=this.parentElement;},
      replaceWith(child){child.parentElement=this.parentElement;},
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
  ['bot','land','leval','bc','app','shell','login'].forEach(id=>elements.set(id,element(id)));
  elements.get('land').hidden=fromLogin;
  elements.get('login').textContent='Log in';
  elements.get('app').hidden=true;
  document.body=element('body');
  document.body.appendChild(elements.get('app'));
  document.getElementById=id=>elements.get(id)||null;
  document.createElement=()=>element('');
  document.createComment=()=>element('placeholder');
  document.querySelector=selector=>selector==='.shell'?elements.get('shell'):element('heading');
  document.addEventListener=(type,fn)=>listeners.set(type,fn);
  document.removeEventListener=(type,fn)=>{if(listeners.get(type)===fn)listeners.delete(type);};
  const podium={ext:{pendingEval:()=>!returning},voiceOn:voice,welcomeStop(){},hushNow(){},robotDoorPose:pose=>poses.push(pose)};
  if(narration)podium.robotDoorNarrate=(text,hooks)=>{
    narrations++;if(throwSpeech)throw Error('unavailable');
    speech={text,...hooks};return{cancel(){cancellations++;}};
  };
  const context={podium,document,PTWelcomeDoorSpeech:{text:copy},PTReturningGreeting:{text:returningCopy},matchMedia:()=>({matches:reducedMotion}),
    window:{innerHeight:900,addEventListener:(type,fn)=>listeners.set(type,fn),removeEventListener:(type,fn)=>{if(listeners.get(type)===fn)listeners.delete(type);}},
    getComputedStyle:()=>({backgroundColor:'rgb(29,78,216)',transform:'none'}),
    setTimeout(fn,ms){const id=++timerId;timers.set(id,{at:now+ms,fn});return id;},clearTimeout:id=>timers.delete(id)};
  vm.runInNewContext(source,context);
  const advance=ms=>{
    const end=now+ms;
    while(true){const next=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;
      const [id,timer]=next;now=timer.at;timers.delete(id);timer.fn();}
    now=end;
  };
  return{podium,document,elements,timers,listeners,animations,poses,advance,
    start:()=>podium.welcomeEnter(()=>{navigations++;elements.get('app').hidden=false;},{fromLogin,originElement:elements.get('login')}),
    get overlay(){return elements.get('welcome-door');},
    get speech(){return speech;},get narrations(){return narrations;},get cancellations(){return cancellations;},get navigations(){return navigations;}};
}

test('returning login welcomes the user and reveals the same dashboard through the portal',()=>{
  const s=setup({returning:true,fromLogin:true});s.start();
  assert.equal(s.elements.get('land').hidden,true,'no redundant welcome screen');
  assert.equal(s.elements.get('shell').inert,true);
  assert.equal(s.overlay.dataset.destination,'dashboard');
  assert.match(s.overlay.innerHTML,/Welcome back\./);
  assert.equal(s.overlay.querySelector('.welcome-door-origin').textContent,'Log in');
  assert.equal(s.overlay.querySelector('.welcome-door-caption').textContent,returningCopy);
  s.advance(650);assert.equal(s.speech.text,returningCopy);s.speech.onstart();
  assert.equal(s.navigations,0,'waits for narration');
  s.speech.onend();s.advance(1150);
  assert.equal(s.overlay.dataset.connected,'true');
  assert.equal(s.navigations,1);
  assert.equal(s.elements.get('app').inert,true);
  s.advance(1660);
  assert.equal(s.overlay,undefined);
  assert.equal(s.navigations,1);
  assert.equal(s.elements.get('shell').inert,false);
  assert.equal(s.elements.get('app').inert,false);
  assert.equal(s.document.activeElement.id,'heading');
});

test('cancelling a returning login releases the form and prevents late speech from navigating',()=>{
  const s=setup({returning:true,fromLogin:true});s.start();s.advance(650);
  s.podium.welcomeEnterCancel();s.speech.onstart();s.speech.onend();s.advance(30000);
  assert.equal(s.navigations,0);assert.equal(s.overlay,undefined);
  assert.equal(s.elements.get('shell').inert,false);
  assert.equal(s.document.body.style.overflow,'auto');
});

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
  s.advance(1649);assert.equal(s.navigations,0);s.advance(1);
  assert.equal(s.overlay.dataset.phase,'crossing');assert.equal(s.navigations,1);
  const app=s.elements.get('app'),viewport=app.parentElement;
  assert.equal(viewport.className,'welcome-dashboard-window');assert.equal(app.inert,true);
  const aperture=s.animations.find(a=>a.element===viewport);assert.match(aperture.frames[0].clipPath,/inset\(/);
  assert.equal(aperture.frames.at(-1).clipPath,'inset(0px 0px 0px 0px round 0px)');
  s.advance(1499);assert.equal(s.overlay.dataset.phase,'crossing');s.advance(1);assert.equal(s.navigations,1);
  assert.equal(app.parentElement.id,'body');assert.equal(app.inert,false);
  assert.equal(s.overlay.dataset.morphed,'true');
  assert.equal(s.elements.get('land').inert,false);assert.equal(s.elements.get('bc').tabIndex,0);
  assert.equal(s.podium.welcomeEntering(),true,'auto-tour waits until the reveal is removed');
  s.advance(560);assert.equal(s.overlay,undefined);assert.equal(s.timers.size,0);assert.equal(aperture.cancelled,true);
  assert.equal(s.podium.welcomeEntering(),false);
});

test('muted or unavailable narration keeps readable captions, then completes without audio',()=>{
  for(const options of [{voice:false},{narration:false},{throwSpeech:true}]){
    const s=setup(options);s.start();s.advance(850);
    assert.equal(s.overlay.querySelector('.welcome-door-caption').textContent,copy);
    s.advance(2399);assert.equal(s.overlay.dataset.phase,'speaking');s.advance(1);
    assert.equal(s.overlay.dataset.phase,'entering');s.advance(2510);assert.equal(s.navigations,1);
  }
});

test('connected reveal restores focus after Skip becomes hidden without stealing dashboard focus',()=>{
  for(const destination of ['skip','body','dashboard-control']){
    const s=setup();s.start();s.advance(850);s.speech.onstart();s.speech.onend();s.advance(1650+1500);
    assert.equal(s.overlay.dataset.phase,'revealing');
    const control=s.document.createElement('button');
    if(destination==='body')s.document.body.focus(); // visibility:hidden blurs Skip in the browser.
    if(destination==='dashboard-control')control.focus();
    s.advance(560);
    assert.equal(s.overlay,undefined);
    if(destination==='dashboard-control')assert.equal(s.document.activeElement,control,'preserve the user-selected control');
    else assert.equal(s.document.activeElement.id,'heading','move focus to the dashboard after the portal closes');
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
    s.advance(2510);assert.equal(s.navigations,1);s.advance(100000);assert.equal(s.navigations,1);
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

test('cancelling or skipping during the portal morph cannot cause a late second navigation',()=>{
  for(const skip of [false,true]){
    const s=setup();s.start();s.advance(850);s.speech.onstart();s.speech.onend();s.advance(1650);
    assert.equal(s.overlay.dataset.phase,'crossing');
    if(skip)s.overlay.querySelector('[data-door-skip]').onclick();else s.podium.welcomeEnterCancel();
    s.advance(100000);assert.equal(s.navigations,1);assert.equal(s.overlay,undefined);
    assert.equal(s.elements.get('app').parentElement.id,'body');assert.equal(s.elements.get('app').inert,false);
    assert.equal(s.timers.size,0);assert.ok(s.animations.every(a=>a.cancelled));
  }
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
