/* PresentTrack companion: a robot that sits in the lower right corner.
   - greets you after sign-in
   - its eyes follow the cursor when you are close
   - click it to talk: it listens, shows what it hears live, then gives quick feedback */
(()=>{
const T=window.THREE;if(!T||!T.GLTFLoader)return;
const $=id=>document.getElementById(id),bot=$('bot'),cv=$('bc');
const EV={start:'wave',speaking:'listening',analyzing:'thinking',feedback:'talking',good:'celebrate',stop:'idle',open:'idle'};
const TXT={wave:'Let us go!',listening:'● Listening…',thinking:'Analyzing…',talking:'Nice pace! Pause after key points.',celebrate:'Great job!'};
const st={n:'idle',until:0,t0:0},C={yaw:0,pitch:0,roll:0,lean:0,hR:0,hL:0,mouth:0,ear:0,ex:0,ey:0};
let R,scene,cam,root,mix,N={},ready=false,shown=false,W=0,H=0,RH=130,t=0,last=0,cur={x:-999,y:-999},tms=[];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),sec=()=>performance.now()/1000,later=(f,ms)=>{const i=setTimeout(f,ms);tms.push(i);return i},clearAll=()=>{tms.forEach(clearTimeout);tms=[]};
const Y=new T.Vector3(0,1,0),Z=new T.Vector3(0,0,1),q1=new T.Quaternion(),q2=new T.Quaternion(),q3=new T.Quaternion();
addEventListener('pointermove',e=>{cur.x=e.clientX;cur.y=e.clientY},{passive:true});
/* Guided-tour narration keeps its existing captions. Live Tracy audio has separate controls. */
const rcap=$('rcap'),rsub=$('rsub');let rct;
function say(x){clearTimeout(rct);
  if(!x||bot.classList.contains('tourmode')||(window.speechSynthesis&&podium.voiceOn!==false)){rcap.hidden=true;return}
  rsub.textContent=x;rcap.hidden=false;rct=setTimeout(()=>{rcap.hidden=true},Math.min(14000,2500+x.length*60))}
/* ---- robot voice (speech synthesis) ---- */
const SY=window.speechSynthesis;let speaking=false;podium.voiceOn=true;
function pickVoice(){const vs=(SY.getVoices()||[]).filter(v=>/^en/i.test(v.lang));return vs.find(v=>/Google US English|Samantha|Aria|Jenny|Zira|Karen|Moira|Serena|Female/i.test(v.name))||vs.find(v=>/en[-_]US/i.test(v.lang))||vs[0]||null}
function clean(t){return String(t).replace(/[●“”]/g,'').replace(/…/g,'.').replace(/\bwpm\b/gi,'words per minute').replace(/[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/gu,'').replace(/\s+/g,' ').trim()}
function hush(){globalThis.TracyAudio?.cancel();try{SY&&SY.cancel()}catch(e){}speaking=false}
let nar={started:false,ended:false,pos:0};
function speak(text,done,playback={}){
  hush();const my=nar={started:false,ended:false,pos:0};
  const t=clean(text);
  if(!t||podium.voiceOn===false||V.on||document.hidden){my.ended=true;done?.();return}
  const fail=()=>{speaking=false;my.failed=true;my.ended=true;rsub.textContent=t;rcap.hidden=bot.classList.contains('tourmode');done?.()};
  if(!globalThis.TracyAudio){fail();return}
  TracyAudio.speak(t,{onstart:()=>{if(nar!==my)return;speaking=true;my.started=true;playback.onstart?.()},onpause:()=>{if(nar!==my)return;speaking=false;playback.onpause?.()},onend:()=>{if(nar!==my)return;speaking=false;my.ended=true;done?.()},onerror:fail});
}
const mute=$('bmute');
podium.setVoice=on=>{podium.voiceOn=on;window.PTVoice&&PTVoice.setSpeaker(on);mute.textContent=on?'🔊':'🔇';mute.setAttribute('aria-pressed',String(!on));mute.setAttribute('aria-label',on?'Mute Tracy\'s voice':'Unmute Tracy\'s voice');mute.title=on?'Mute Tracy\'s voice':'Unmute Tracy\'s voice';if(!on)hush()};
mute.onclick=()=>podium.setVoice(podium.voiceOn===false);

podium.prepareNarration=text=>podium.voiceOn!==false?globalThis.TracyAudio?.prepare(clean(text)):Promise.resolve(false);
podium.narrate=(text,est)=>{if(window.PTVoice&&PTVoice.active)PTVoice.stop();set('talking',Math.min(60000,(est||8000)*2.5),'',text)};
podium.narState=()=>({voice:!!globalThis.TracyAudio&&podium.voiceOn!==false&&!V.on,started:nar.started,ended:nar.ended,failed:!!nar.failed,pos:nar.pos||0,speaking});
podium.narPause=p=>{globalThis.TracyAudio?.pause(p)};podium.hushNow=()=>{hush();set('idle',0,'')};
podium.robotIntroduce=(text,done,onstart)=>{
  clearAll();stopVoice();set('idle',0,'');let greeted=false;
  speak(text,()=>{clearAll();set('idle',0,'');done?.()},{
    onstart:()=>{clearAll();if(!greeted){greeted=true;set('wave',0,'');later(()=>{if(speaking)set('talking',0,'')},1100)}else set('talking',0,'');onstart?.()},
    onpause:()=>{clearAll();set('idle',0,'')}
  });
};
podium.robotPoint=()=>set('point',0,'');
podium.robotReady=()=>ready&&W>0;
podium.robotWelcomeWave=()=>set('wave',1800,'');
function set(n,dur,txt,spoken){st.n=n;st.t0=sec();st.until=dur?st.t0+dur:0;say(txt===undefined?(TXT[n]||''):txt);if(spoken)speak(spoken)}
podium.emit=ev=>{const n=EV[ev];if(!n)return;stopVoice();clearAll();set(n,n==='wave'?2000:n==='celebrate'?2600:0)};

/* ---- Tracy: live voice controls, preserving the existing model and animations ---- */
const V={on:false,busy:false},voice=window.PTVoice;
function stopVoice(){if(voice.active)voice.stop()}
voice.setHooks({
  prepare:()=>{hush();clearAll();podium.tourPause&&podium.tourPause()},
  state:x=>{V.on=x.active;V.busy=x.active;const n={listening:'listening',thinking:'thinking',speaking:'talking',connecting:'thinking',permission:'listening'}[x.state]||'idle';set(n,0,'')},
  encourage:()=>{if(V.on)set('celebrate',1800,'')}
});
podium.openChat=()=>voice.open();
podium.openVoice=()=>voice.open();
function addRot(n,ax,a){if(!n||Math.abs(a)<.002)return;
  n.parent.getWorldQuaternion(q1);q2.copy(root.quaternion).invert();q1.premultiply(q2);
  q3.setFromAxisAngle(ax,a).premultiply(q2.copy(q1).invert()).multiply(q1);n.quaternion.premultiply(q3)}
function size(){const w=cv.clientWidth,h=cv.clientHeight;
  if(w!==W||h!==H){W=w;H=h;R.setSize(w,h,false);cam.aspect=w/h;cam.position.z=(h/2)/Math.tan(Math.PI/12);cam.far=cam.position.z*4;cam.updateProjectionMatrix();RH=bot.classList.contains('welcome')?h*.82:clamp(h*.5,100,135)}
  root.scale.setScalar(RH)}
function init(){
  R=new T.WebGLRenderer({canvas:cv,alpha:true,antialias:true});R.outputEncoding=T.sRGBEncoding;R.toneMapping=T.ACESFilmicToneMapping;R.toneMappingExposure=1.1;R.setPixelRatio(Math.min(devicePixelRatio||1,2));
  scene=new T.Scene();cam=new T.PerspectiveCamera(30,1,10,5000);
  scene.add(new T.HemisphereLight(0xe6f1ff,0x24356b,1));
  const d=new T.DirectionalLight(0xffffff,1.7);d.position.set(2.5,3.5,4);scene.add(d);
  const r=new T.PointLight(0x7fb8ff,1.2);r.position.set(-300,80,-150);scene.add(r);
  root=new T.Group();scene.add(root);
  const bin=Uint8Array.from(atob(window.PT_ROBOT_GLB_B64),c=>c.charCodeAt(0)).buffer;
  new T.GLTFLoader().parse(bin,'',g=>{
    const model=g.scene;root.add(model);model.traverse(o=>{N[o.name]=o});
    const f=n=>N[T.PropertyBinding.sanitizeNodeName(n)];
    N.mouth=f('Mouth');N.eyes=f('Eyes');N.ears=f('Ears');N.hR=f('Hand origin');N.hL=f('Hand origin.002');
    N.waves=['Wave','Wave.001','Wave.002','Wave.003'].map(f).filter(Boolean);N.waves.forEach(n=>n.visible=false);
    N.mb=N.mouth.scale.clone();N.ex=N.eyes.position.x;N.ez=N.eyes.position.z;N.model=model;
    model.updateMatrixWorld(true);let b=new T.Box3().setFromObject(model);
    model.scale.setScalar(1/b.getSize(new T.Vector3()).y);model.updateMatrixWorld(true);b=new T.Box3().setFromObject(model);model.position.sub(b.getCenter(new T.Vector3()));
    mix=new T.AnimationMixer(model);if(g.animations[0]){mix.clipAction(g.animations[0]).play()}
    ready=true;
  },e=>console.warn('robot load failed',e));
  requestAnimationFrame(loop);
}
function fail(e){console.warn('robot disabled',e);shown=false;ready=false;bot.hidden=true;podium.robotShow=()=>{};podium.emit=()=>{};podium.robotSay=()=>{}}
function loop(){requestAnimationFrame(loop);if(!ready||!shown||document.hidden||bot.hidden)return;try{frame()}catch(e){fail(e)}}
function frame(){
  const now=sec(),dt=Math.min(now-last,.1);last=now;t+=dt;size();
  if(st.until&&now>st.until&&!V.on){st.until=0;set('idle',0,'')}
  const r=cv.getBoundingClientRect(),dx=cur.x-(r.left+r.width/2),dy=cur.y-(r.top+r.height/2),dist=Math.hypot(dx,dy);
  const prox=clamp(1-(dist-300)/320,0,1),lx=clamp(dx/240,-1,1)*prox,ly=clamp(-dy/240,-1,1)*prox,s=st.n;
  const g={yaw:lx*.14,pitch:-ly*.08,roll:0,lean:0,hR:0,hL:0,mouth:0,ear:0,ex:lx,ey:ly};
  if(s==='wave'){g.hL=-(2.7+.4*Math.sin(t*11));g.roll=.1}
  else if(s==='listening'){g.lean=.14;g.roll=.08+Math.sin(t*1.6)*.06}
  else if(s==='thinking'){g.pitch=.16;g.roll=-.14;g.ear=.4}
  else if(s==='talking'&&(speaking||V.on)){g.mouth=1;g.pitch+=Math.sin(t*5)*.06;if(bot.classList.contains('welcome')){g.hR=.55+.25*Math.sin(t*2.5);g.hL=-.4-.2*Math.sin(t*2.5)}}
  else if(s==='point'){g.hR=.2;g.hL=-1.25-.08*Math.sin(t*2);g.pitch=.08;g.roll=-.08;g.yaw=-.18;g.ex=-1;g.ey=-.2}
  else if(s==='celebrate'){const f=Math.sin(t*14);g.hR=2.9+.25*f;g.hL=-(2.9-.25*f);g.mouth=.6}
  if(speaking)g.mouth=Math.max(g.mouth,1);
  const a=1-Math.exp(-dt*8);for(const k in g)C[k]+=(g[k]-C[k])*a;
  const welcome=bot.classList.contains('welcome'),still=welcome&&matchMedia('(prefers-reduced-motion:reduce)').matches;
  root.rotation.set(still?0:C.pitch+C.lean,still?0:C.yaw,still?0:C.roll,'YXZ');root.position.set(0,welcome?(still?0:Math.sin(t*1.8)*10):-H*(bot.classList.contains('app')?.06:.18),0);
  mix.update(dt);N.model.updateMatrixWorld(true);
  addRot(N.hR,Z,still?0:C.hR);addRot(N.hL,Z,still?0:C.hL);addRot(N.ears,Y,Math.sin(t*3)*.5*C.ear);
  if(C.mouth>.01){const m=1+C.mouth*.3*Math.abs(Math.sin(t*13));N.mouth.scale.set(N.mb.x*m,N.mb.y,N.mb.z*m);N.mouthOn=true}else if(N.mouthOn){N.mouth.scale.copy(N.mb);N.mouthOn=false}   // absolute from base: never compounds
  N.eyes.position.x=N.ex+C.ex*.12;N.eyes.position.z=N.ez+C.ey*.06;   // eyes only slide; never resize
  R.render(scene,cam);
}
podium.robotSay=(kind,text,dur)=>{if(!shown||bot.hidden||V.on||V.busy)return;const m={idle:'idle',greeting:'wave',encouraging:'talking',reminder:'listening',success:'celebrate',thinking:'thinking'}[kind]||'idle';clearAll();set(m,m==='idle'?0:(dur||4500),text,['greeting','reminder','encouraging','success'].includes(kind)?text:undefined)};
podium.robotShow=(v,where)=>{shown=v;bot.hidden=!v||(where==='app'&&!!podium.min);if(!v){voice.stop()}{const mi=document.getElementById('bmini');if(mi&&(!v||where!=='app'))mi.hidden=true}clearAll();stopVoice();V.busy=voice.active;
  if(v){document.body.appendChild(bot);bot.classList.toggle('app',where==='app');W=H=0;
    if(!R){try{init()}catch(e){fail(e);return}}last=sec();t=0;set('idle',0,'');
    if(where==='land')later(()=>{if(shown&&!V.on&&!V.busy){const n=podium.name||'there',nw=podium.isNew&&podium.isNew(),m=nw?'Hello '+n+'! Welcome to PresentTrack. Let me show you around.':'Hello '+n+'! Welcome back. Open my voice controls to talk with Tracy.';set('wave',nw?4400:3800,m,nw?m:'Hello '+n+'! Welcome back.')}},900)}
  else{hush();set('idle',0,'')}};
})();
 
