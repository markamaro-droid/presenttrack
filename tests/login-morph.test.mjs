import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../js/login-morph.js',import.meta.url),'utf8');
function setup({reduced=false,hidden=false,noAnimation=false,missingTarget=false,brokenAnimation=false}={}){
  const elements=new Map(),listeners=new Map(),timers=new Map(),animations=[];
  let now=0,id=0,mounts=0;
  const document={hidden,activeElement:null};
  const element=(name,rect={left:650,top:80,width:440,height:620})=>{
    const classes=new Set();
    return {id:name,hidden:false,inert:false,style:{opacity:'',overflow:'auto'},dataset:{},children:[],
      classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x)},
      getBoundingClientRect:()=>rect,setAttribute(){},removeAttribute(){},
      querySelectorAll:()=>[],cloneNode:()=>element('preview',rect),
      appendChild(child){this.children.push(child);elements.set(child.id,child);},remove(){elements.delete(this.id);},
      focus(){document.activeElement=this;},
      animate(frames,options){if(brokenAnimation)throw Error('Animation unavailable');const a={element:this,frames,options,cancelled:false,cancel(){this.cancelled=true;}};animations.push(a);return a;}
    };
  };
  for(const name of ['body','html','card','shell','app','heading'])elements.set(name,element(name));
  elements.set('target',element('target',{left:280,top:150,width:850,height:340}));
  elements.get('app').hidden=true;
  if(noAnimation)delete elements.get('card').animate;
  document.body=elements.get('body');document.documentElement=elements.get('html');
  document.querySelector=selector=>elements.get(({'.shell':'shell','.auth .card':'card','#view .dh-hero':missingTarget?'missing':'target','#view h1, #view h2':'heading'})[selector]);
  document.getElementById=id=>elements.get(id);
  document.createElement=()=>element('');
  document.addEventListener=(name,fn)=>listeners.set(name,fn);
  document.removeEventListener=name=>listeners.delete(name);
  const podium={};
  vm.runInNewContext(source,{podium,document,console,
    window:{scrollTo(){},addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)},
    matchMedia:()=>({matches:reduced}),getComputedStyle:()=>({borderRadius:'24px',backgroundColor:'#102030',borderColor:'#304050'}),
    setTimeout(fn,ms){timers.set(++id,{at:now+ms,fn});return id;},clearTimeout:id=>timers.delete(id)});
  const advance=ms=>{
    const end=now+ms;
    for(;;){const next=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;
      const [id,t]=next;now=t.at;timers.delete(id);t.fn();}
    now=end;
  };
  return{podium,elements,listeners,timers,animations,document,advance,
    start:()=>podium.loginMorph(()=>{mounts++;elements.get('app').hidden=false;elements.get('shell').hidden=true;}),
    get mounts(){return mounts;},get overlay(){return elements.get('login-morph');}};
}

function released(s){
  assert.equal(s.overlay,undefined);assert.equal(s.podium.loginEntering(),false);
  assert.equal(s.elements.get('app').inert,false);assert.equal(s.elements.get('shell').inert,false);
  assert.equal(s.elements.get('app').style.opacity,'');assert.equal(s.document.body.style.overflow,'auto');
  assert.equal(s.document.documentElement.classList.contains('login-morph-active'),false);
  assert.equal(s.timers.size,0);assert.equal(s.listeners.size,0);
}

test('login morph mounts once, ends at the dashboard panel and releases focus and interaction',()=>{
  const s=setup();assert.equal(s.start(),true);assert.equal(s.start(),false);
  assert.equal(s.mounts,0);assert.equal(s.elements.get('shell').inert,true);
  s.advance(200);assert.equal(s.mounts,1);assert.equal(s.overlay.dataset.phase,'morphing');
  const morph=s.animations.find(a=>a.frames[0].width);
  assert.equal(morph.frames[0].width,'440px');assert.equal(morph.frames[1].width,'850px');
  morph.onfinish();s.advance(5000);released(s);assert.equal(s.mounts,1);
  assert.equal(s.document.activeElement.id,'heading');
});

test('reduced motion, hidden tabs and unsupported animation go directly to the dashboard',()=>{
  for(const options of [{reduced:true},{hidden:true},{noAnimation:true},{brokenAnimation:true},{missingTarget:true}]){
    const s=setup(options);s.start();s.advance(5000);released(s);
    assert.equal(s.mounts,1);assert.equal(s.elements.get('app').hidden,false);
  }
});

test('Escape, resize, hidden tab and the watchdog finish a morph even without animation callbacks',()=>{
  for(const action of ['Escape','resize','visibilitychange','timeout'])for(const during of [0,250]){
    const s=setup();s.start();s.advance(during);
    if(action==='Escape')s.listeners.get('keydown')({key:'Escape',preventDefault(){},stopPropagation(){}});
    else if(action==='visibilitychange'){s.document.hidden=true;s.listeners.get(action)();}
    else if(action==='resize')s.listeners.get(action)();
    s.advance(5000);released(s);assert.equal(s.mounts,1);
  }
});

test('account cancellation before or after mounting cannot navigate later or steal focus',()=>{
  for(const during of [0,250]){
    const s=setup();s.start();s.advance(during);
    const count=s.mounts;s.podium.loginMorphCancel();
    for(const a of s.animations)a.onfinish?.();s.advance(5000);
    released(s);assert.equal(s.mounts,count);assert.equal(s.document.activeElement,null);
  }
});
