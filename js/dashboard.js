/* Dashboard */
window.podium={};
(()=>{
const ic=p=>`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${p}"/></svg>`;
const I={dash:'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',decks:'M3 4h18v12H3zM8 20h8M12 16v4',prac:'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3',rep:'M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h7',perf:'M4 20V10M10 20V4M16 20v-7M22 20H2',prog:'M3 17l6-6 4 4 8-8M15 7h6v6',hist:'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',note:'M6 16v-5a6 6 0 0 1 12 0v5l2 2H4zM10 21h4',set:'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M14 4v4M8 10v4M16 16v4',help:'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6M12 17h.01',out:'M9 4H5v16h4M16 8l4 4-4 4M20 12H9',up:'M12 16V4m0 0l-4 4m4-4l4 4M4 20h16',plus:'M12 5v14M5 12h14',vid:'M3 6h12v12H3zM15 10l6-3v10l-6-3',goal:'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12h.01',pace:'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',fill:'M4 5h16v11H9l-5 4z',pause:'M8 5v14M16 5v14',star:'M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.8 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z',search:'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5'};
I.eval=I.goal;
const NAV=[['MAIN',[['dash','Dashboard'],['eval','Evaluation'],['decks','My Presentations'],['perf','Performance'],['prog','Progress'],['hist','Practice History']]],['SYSTEM',[['note','Notifications'],['set','Settings']]]];
const PARENT={pdet:'decks',create:'decks',up:'decks',ready:'decks',prac:'decks',rec:'decks',weak:'decks',assess:'decks',assres:'decks',rdet:'hist',rep:'hist',coach:'perf',goals:'prog'};
const $$=q=>[...document.querySelectorAll(q)];
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fmt=x=>Math.floor(x/60)+':'+String(Math.floor(x%60)).padStart(2,'0');
const avg=a=>a.length?Math.round(a.reduce((x,y)=>x+y,0)/a.length):0;
const rm=matchMedia('(prefers-reduced-motion:reduce)').matches;
const MET={wpm:{n:'WPM',f:v=>v+' WPM'},fill:{n:'Filler Words',f:v=>v},pau:{n:'Long Pauses',f:v=>v},dur:{n:'Duration',f:fmt},score:{n:'Performance Score',f:v=>v+'%'}};
const S={u:{name:'',email:'',pic:''},view:'dash',arg:null,loading:false,booted:false,flash:null,warnOff:false,pres:[],ses:[],notes:[],goals:[],nid:20};
let tm,toastT,rts=[];
function initData(mode){
  S.flash=null;S.warnOff=false;S.loading=false;S.booted=false;S.guide=(mode==='empty');S.isNew=(mode==='empty');S.toured=false;
  if(mode==='empty'){S.pres=[];S.ses=[];S.notes=[];S.goals=[];return}
  const mk=(id,deck,d,dur,wpm,fill,pau,score,tg)=>({id,deck,d,dur,wpm,fill,pau,score,tg});
  S.pres=[{id:1,t:'Capstone Proposal Defense',short:'Capstone Proposal',file:{name:'capstone-proposal.pptx',size:2516582},date:'June 15, 2026',time:'9:00 AM',target:600,ready:78,ppt:true,rq:true,sp:true,final:false,left:3},
          {id:2,t:'Intro to UX Pitch',short:'Intro to UX Pitch',file:{name:'ux-pitch.pdf',size:1048576},date:'July 2, 2026',time:'2:00 PM',target:300,ready:46,ppt:false,rq:false,sp:true,final:false,left:20}];
  S.ses=[mk(1,'Intro to UX Pitch','June 4',318,160,16,4,70,300),mk(2,'Capstone Proposal','June 6',672,178,32,7,75,600),mk(3,'Capstone Proposal','June 8',634,164,21,4,81,600),mk(4,'Capstone Proposal','June 10',598,151,12,2,87,600)];
  S.notes=[{ic:'🔔',t:'Presentation Reminder',s:'Your Capstone Proposal is in 3 days.',r:0,warn:1},{ic:'🎯',t:'Practice Recommendation',s:'Your AI Coach recommends practicing your introduction.',r:0},{ic:'📈',t:'Progress Update',s:'Your speaking pace improved in your latest attempt.',r:0}];
  S.goals=[{t:'Keep speaking pace between 100 and 160 WPM',p:100},{t:'Reduce filler words to 8 or fewer',p:75},{t:'Reach a performance score of 90%',p:87},{t:'Finish within 30 seconds of the target time',p:100}];
}
initData('default');
const DB={};   /* in-memory account database, keyed by email */
podium.account=(email,registered)=>{
  S.reviewDays=0;S.historyQuery="";S.historyType="all";S.historySort="newest";S.compareA=S.compareB="";S.reviewMetric="score";S.compareDeck="";S.assess=null;S.assessRequired=false;S.ev=null;S.evalRequired=false;
  if(window.PTCloud&&PTCloud.enabled){
    const row=PTCloud.row;
    if(registered||!row){initData('empty');PTCloud.onboarded=false}
    else{
      if(row.data&&row.data.pres){const d=row.data;S.pres=d.pres;S.ses=d.ses;S.notes=d.notes;S.goals=d.goals;S.nid=d.nid;S.ev=d.ev||null}else initData('empty');
      if(row.data&&row.data.ev&&!S.ev)S.ev=row.data.ev;
      S.flash=null;S.warnOff=false;S.loading=false;S.booted=false;S.isNew=!row.onboarded;S.guide=!row.onboarded;S.toured=!!row.onboarded;PTCloud.onboarded=!!row.onboarded}
    S.assessRequired=!PTCloud.assessmentDone;S.evalRequired=!PTCloud.assessmentDone;PTCloud.ready=true;return}
  const k=email.toLowerCase(),rec=DB[k];
  if(registered){DB[k]={onboarded:false,data:null,evalReq:true};initData('empty');S.evalRequired=true;return}
  if(rec){
    if(rec.data){S.pres=rec.data.pres;S.ses=rec.data.ses;S.notes=rec.data.notes;S.goals=rec.data.goals;S.nid=rec.data.nid;S.ev=rec.data.ev||null}else initData(rec.onboarded?'default':'empty');
    S.flash=null;S.warnOff=false;S.loading=false;S.booted=false;S.isNew=!rec.onboarded;S.guide=!rec.onboarded;S.toured=!!rec.onboarded;S.evalRequired=!!rec.evalReq;return}
  initData('default');DB[k]={onboarded:true,data:null}};
podium.snapshot=()=>({pres:S.pres,ses:S.ses,notes:S.notes,goals:S.goals,nid:S.nid,ev:S.ev||null});
podium.save=()=>{if(window.PTCloud&&PTCloud.enabled){PTCloud.save(podium.snapshot());return}const k=(S.u.email||'').toLowerCase();if(DB[k])DB[k].data=podium.snapshot()};
const fsize=n=>n>=1048576?(n/1048576).toFixed(1)+' MB':Math.max(1,Math.round(n/1024))+' KB';
const ftype=n=>{const e=(n.split('.').pop()||'').toLowerCase();return e==='pdf'?{l:'PDF',c:'pdf'}:e.startsWith('doc')?{l:'Word',c:'word'}:{l:'PowerPoint',c:'ppt'}};
const cap=()=>S.ses.filter(x=>!x.assess&&x.analysis&&(S.compareDeck?String(x.deckId)===String(S.compareDeck):true));
const att=p=>S.ses.filter(x=>!x.assess&&x.analysis&&(String(x.deckId)===String(p.id)||(!x.deckId&&x.deck===p.short))).length;
const unread=()=>S.notes.filter(n=>!n.r).length;
const empty=()=>!S.pres.length;
const avData=n=>'data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#7FD0FA"/><stop offset="1" stop-color="#1877D2"/></linearGradient></defs><rect width="80" height="80" fill="url(#g)"/><text x="40" y="52" font-size="32" font-family="sans-serif" font-weight="700" fill="#fff" text-anchor="middle">${esc(n.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase())}</text></svg>`);
const pic=()=>S.u.pic||avData(S.u.name||'U');
const toast=(m)=>{const t=$('toast');t.textContent=m;t.classList.add('on');clearTimeout(toastT);toastT=setTimeout(()=>t.classList.remove('on'),2600)};
const robot=(k,t,d)=>{try{podium.robotSay&&podium.robotSay(k,t,d)}catch(e){}};

const tips=x=>x.analysis?Object.values((podium.measuredReport?.(x.analysis)||x.analysis).feedback).filter(Array.isArray).flat():[x.dur<x.tg*.9?'You finished '+fmt(x.tg-x.dur)+' early. Add an example to fill the time.':x.dur>x.tg*1.05?'You ran '+fmt(x.dur-x.tg)+' over. Trim your weakest point.':'Timing is on target at '+fmt(x.dur)+'.',
  x.fill>10?x.fill+' filler words. Replace them with a short pause.':x.fill?'Only '+x.fill+' filler words. Nice control.':'No filler words. Clean delivery.',
  x.wpm>160?'Pace was '+x.wpm+' WPM, which is fast. Slow down in your introduction.':x.wpm<100?'Pace was '+x.wpm+' WPM, which is slow. Reference range: 100 to 160 WPM.':'Pace was '+x.wpm+' WPM, in the clear zone.',
  x.pau>3?x.pau+' long pauses. Keep your notes close to avoid losing your place.':'Long pauses are under control ('+x.pau+').'];

/* ---------- automatic video-style tour (new users, or on request) ---------- */
const T={on:false,i:0,play:true,t0:0,pAt:0,est:8000,timer:null,steps:[]};
function tourSteps(){return window.PTTourSteps.map(step=>({...step,v:step.view,t:step.title,x:step.voiceLine}));}
let spotlight;
const tourEl=()=>$('tour');
function syncGuide(){$('bguide').hidden=!!(T.on||$('app').hidden)}
function tourUI(){const st=T.steps[T.i],last=!!st.fin;tourEl().hidden=false;
  tourEl().innerHTML=`<div class="tp1"><b>Step ${T.i+1}/${T.steps.length}</b><span>${esc(st.t)}</span></div><div class="tsegs">${T.steps.map((_,k)=>`<i><b id="ts${k}" style="width:${k<T.i?100:0}%"></b></i>`).join('')}</div><div class="tbt"><button type="button" data-tact="tprev" ${T.i?'':'disabled'} aria-label="Previous step">Back</button><button type="button" data-tact="tplay" aria-label="${T.play?'Pause':'Play'}">${T.play?'Pause':'Play'}</button><button type="button" data-tact="tnext">${last?'Finish':'Next'}</button>${last?'<button type="button" class="wide" data-tact="tadd">Add presentation</button>':'<button type="button" class="wide skip" data-tact="tskip">Skip tour</button>'}<button type="button" data-tact="tcc" aria-pressed="${!!T.ccShown}" aria-label="Captions">CC</button></div><button type="button" class="tour-stop" data-tact="tskip">End tour</button><button type="button" class="tcolb" data-tact="tcol" aria-expanded="${!$('bot').classList.contains('tcol')}" aria-label="${$('bot').classList.contains('tcol')?'Show tour controls':'Hide tour controls'}" title="${$('bot').classList.contains('tcol')?'Show tour controls':'Hide tour controls'}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button>`;
  const shortLabels={tprev:'Back',tplay:T.play?'Pause':'Play',tnext:last?'Done':'Next',tskip:'End',tadd:'Add',tcc:'CC'};
  tourEl().querySelectorAll('.tbt button').forEach(button=>{
    const text=button.textContent,action=button.dataset.tact;
    if(!button.hasAttribute('aria-label'))button.setAttribute('aria-label',text);
    button.innerHTML='<span class="tour-label-full">'+esc(text)+'</span><span class="tour-label-short" aria-hidden="true">'+esc(shortLabels[action]||text)+'</span>';
  });
  const mobileCopy=document.createElement('p');mobileCopy.className='tour-mobile-copy';mobileCopy.textContent=st.x;mobileCopy.setAttribute('aria-live','polite');tourEl().appendChild(mobileCopy);
  const sub=$('tsub');if(sub)sub.innerHTML='<span class="sl">'+esc(st.x)+'</span>';if(T.sf)tourSub(T.sf,T.sp)}
function tourSub(frac,pos){T.sf=frac;T.sp=pos;const st=T.steps[T.i],el=$('tsub');let n=pos>0?pos:Math.round(st.x.length*frac);if(n>=st.x.length)n=st.x.length;else{const sp=st.x.indexOf(' ',n);n=sp<0?st.x.length:sp}n=Math.max(n,T.nmax||0);T.nmax=n;if(el)el.innerHTML='<b>'+esc(st.x.slice(0,n))+'</b>'+esc(st.x.slice(n));T.n=n;return n}
function spotOff(){spotlight?.stop();$('spot').hidden=true;}
function tourAct(a){if(a==='tcol'){document.body.classList.toggle('tourcol',$('bot').classList.toggle('tcol'));tourUI();return}if(a==='tprev')tourGo(-1);else if(a==='tnext')tourGo(1);else if(a==='tplay')tourPlay(!T.play);else if(a==='tskip')endTour(true);else if(a==='tcc'){T.cc=!T.ccShown;T.ccShown=T.cc;$('tcap').hidden=!T.cc;tourUI()}else if(a==='tadd'){endTour(false);go('decks');setTimeout(()=>{const u=$('ut');if(u)u.focus()},400)}}
function tourShow(i,direction=1){
  clearTimeout(T.advanceTimer);T.generation=(T.generation||0)+1;spotOff();
  // Visit each configured page, but never describe a missing or gated control.
  let st,el;
  while(i>=0&&i<T.steps.length){
    T.i=i;st=T.steps[i];
    if(S.view!==st.v)go(st.v);else nav();
    $('side').classList.remove('open');
    el=document.querySelector(st.target);
    if(el&&el.getBoundingClientRect().width>=2&&el.getBoundingClientRect().height>=2)break;
    i+=direction;
  }
  if(i<0){tourShow(0);return;}if(i>=T.steps.length){endTour(false);return;}
  $('bot').classList.remove('tourhl');
  T.est=Math.max(2800,st.x.split(/\s+/).length*350+500);T.t0=performance.now();T.pAt=0;T.play=true;T.adv=false;T.captionOnly=false;T.audioStarted=false;T.sf=0;T.sp=0;T.n=0;T.nmax=0;
  tourUI();
  spotlight ||= new window.PTTourSpotlight($('spot'));
  spotlight.start(st.target,st.title,st.description);
  try{podium.narrate&&podium.narrate(st.x,T.est)}catch(e){}
  // Start look-ahead while this clip loads, rather than waiting for playback.
  // Reuse the speech player's pending requests/cache; never synthesize the whole tour.
  const generation=T.generation;
  Promise.resolve().then(async()=>{
    for(const next of T.steps.slice(T.i+1,T.i+3)){
      if(!T.on||T.generation!==generation)break;
      try{await podium.prepareNarration?.(next.x)}catch(e){}
    }
  });
}
function tourGo(d){if(!T.on)return;const n=T.i+d;if(n>=T.steps.length){endTour(false);return}tourShow(n,d)}
function tourPlay(p){if(!T.on||T.play===p)return;T.play=p;if(p){T.t0+=performance.now()-T.pAt}else T.pAt=performance.now();try{podium.narPause&&podium.narPause(!p)}catch(e){}tourUI()}
function tourTick(){
  if(!T.on)return;if(!T.play||T.adv)return;let el=performance.now()-T.t0;const ns=(podium.narState&&podium.narState())||{voice:false};
  // A slow provider must not hold a step in silence for its full network timeout.
  if(!T.captionOnly&&ns.voice&&!ns.started&&!ns.ended&&el>6000){
    T.captionOnly=true;podium.hushNow?.();T.t0=performance.now();el=0;
  }
  const voice=ns.voice&&!ns.failed&&!T.captionOnly;
  if(voice&&ns.started&&!T.audioStarted){T.audioStarted=true;T.t0=performance.now();el=0}
  {const want=T.cc===null?(!voice||!ns.started):T.cc;if(want!==T.ccShown){T.ccShown=want;$('tcap').hidden=!want}}
  const done=voice?ns.ended:el>T.est;
  const b=$('ts'+T.i);if(b)b.style.width=Math.min(97,el/(voice?Math.max(T.est,el+800):T.est)*100)+'%';
  tourSub(voice&&!ns.started?0:voice&&ns.ended?1:Math.min(1,el/(T.est*.82)),voice&&ns.pos>0&&!ns.ended?ns.pos:0);
  if(done){const b2=$('ts'+T.i);if(b2)b2.style.width='100%';tourSub(1,0);T.adv=true;const generation=T.generation;T.advanceTimer=setTimeout(()=>{if(generation!==T.generation)return;T.adv=false;if(T.on&&T.play)tourGo(1)},0)}
}
function startTour(){
  if(T.on)return;if($('app').hidden)return;
  window.PTVoice?.active&&PTVoice.stop();
  S.guide=true;T.on=true;T.steps=tourSteps();closePops();$('hm').hidden=true;setMin(false);
  $('side').classList.remove('open');
  clearInterval(T.timer);T.timer=setInterval(tourTick,100);document.body.classList.add('touring');document.body.classList.remove('tourcol');$('bot').classList.remove('tcol');$('bot').classList.add('tourmode');T.cc=null;T.ccShown=false;syncGuide();tourShow(0)}
function endTour(spoken){
  if(!T.on)return;T.on=false;clearTimeout(T.advanceTimer);T.generation=(T.generation||0)+1;spotOff();clearInterval(T.timer);S.toured=true;S.isNew=false;{const k=(S.u.email||'').toLowerCase();if(DB[k])DB[k].onboarded=true;if(window.PTCloud)PTCloud.onboarded=true}tourEl().hidden=true;$('tcap').hidden=true;$('bot').classList.remove('tourhl','tourmode','tcol');document.body.classList.remove('touring','tourcol');
  try{podium.hushNow&&podium.hushNow()}catch(e){}nav();$('side').classList.remove('open')}
podium.tourStop=()=>{T.on=false;clearTimeout(T.advanceTimer);T.generation=(T.generation||0)+1;spotOff();clearInterval(T.timer);tourEl().hidden=true;$('tcap').hidden=true;document.body.classList.remove('touring','tourcol');$('bot').classList.remove('tourhl','tourmode','tcol');syncGuide()};podium.tourPause=()=>tourPlay(false);podium.startTour=startTour;podium.tourOn=()=>T.on;
/* ---------- robot guide: navigate by voice/text and explain each page ---------- */
const GUIDE={dash:'This is your dashboard. At the top you see your next presentation and how ready you are. Below are your performance numbers, your progress chart, my coaching tip and recent practice.',
 decks:'This is My Presentations. The practice toolkit gives you shortcuts to upload slides, practice, analyze recordings, reports and goals. Type your own title, drop in a PDF or PowerPoint file, then press Add Presentation. You can then practice, rename or open details for each one.',
 prac:'This is Practice. Pick a presentation and a target time, press Start and speak out loud, then press Finish to get your score and tips.',
 rep:'Reports lists every practice session. Press View Report on any row to see the numbers and my feedback.',
 perf:'Performance shows your speaking pace, filler words, long pauses and score, and compares your first and latest attempts.',
 prog:'Progress shows how each number changes attempt by attempt. Use the buttons above the chart to switch between pace, filler words, pauses, duration and score, and check your goals beside it.',
 hist:'Practice History is the full list of your sessions with date, duration, pace, fillers, pauses and score. Press View Report on any row to open it and download it as a PDF.',
 note:'Notifications collects reminders, recommendations and progress updates. Mark one as read, or mark them all.',
 set:'Settings is where you update your profile, reset your password, choose an appearance, manage my voice and export your workspace data.',
 goals:'Goals lets you add targets, like keeping your pace between 100 and 160, and track your progress toward each one.',
 coach:'This is the AI coach analysis. It shows where your pace drifts and what to practice next.'};
const LABEL={dash:'Dashboard',decks:'My Presentations',prac:'Practice',rep:'Reports',perf:'Performance',prog:'Progress',hist:'Practice History',note:'Notifications',set:'Settings',goals:'Goals',coach:'the AI Coach'};
const PAGES=[['dash','dashboard|home|main page|overview'],['decks','my presentations|presentations|presentation|upload|my files'],['prac','practice|rehearse|rehearsal'],['rep','reports|report'],['perf','performance'],['prog','progress'],['hist','practice history|history|past sessions'],['note','notifications|notification|alerts'],['set','settings|setting|profile|preferences'],['goals','goals|goal'],['coach','ai coach|coach|ai feedback']];
const TOUR=['dash','decks','prac','rep','perf','prog','hist','note','set'];
function parseNav(t){let best=null;PAGES.forEach(([v,al])=>al.split('|').forEach(a=>{if(new RegExp('\\b'+a.replace(/ /g,'\\s+')+'\\b').test(t)&&(!best||a.length>best.len))best={v,len:a.length}}));return best&&best.v}
function showPage(v){go(v);let x=GUIDE[v];if(empty()&&v==='prac')x+=' First add a presentation in My Presentations.';if(empty()&&(v==='rep'||v==='perf'||v==='hist'||v==='prog'))x+=' It fills up after your first practice.';return x}
podium.isNew=()=>S.isNew&&!S.toured;
podium.chips=()=>S.isNew?['Go to My Presentations','Go to Practice','Go to Progress']:S.guide?['Guide me again','Go to My Presentations','Go to Practice','Go to Progress']:['Guide me again on how to use the system'];
podium.command=q=>{
  const t=' '+q.toLowerCase().replace(/[.,!?']/g,' ').replace(/\s+/g,' ').trim()+' ';
  if(/\b(guide me|walk me through|give me a tour|take me on a tour|show me around|how (do|can) i use (the |this )?(system|app|website|site|platform)|how does (this|the) (system|app|site|website|platform) work|help me get started|teach me how|explain the system|replay the tour|start the tour)\b/.test(t)){
    if(T.on)return {say:'I am already guiding you. Say skip to stop the tour.',quiet:true,tour:true};
    if(S.isNew)return {say:'New accounts get the guided tour automatically. Once it is finished, you can ask me to guide you again.'};
    startTour();return {say:'Starting the guided tour.',quiet:true,tour:true}}
  if(T.on){
    if(/\b(next|continue|go on|skip step)\b/.test(t)){tourGo(1);return {say:'Next.',quiet:true,tour:true}}
    if(/\b(back|previous|go back)\b/.test(t)){tourGo(-1);return {say:'Going back.',quiet:true,tour:true}}
    if(/\b(pause|wait|hold on)\b/.test(t)){tourPlay(false);return {say:'Paused. Say play to continue.',quiet:true,tour:true}}
    if(/\b(play|resume)\b/.test(t)){tourPlay(true);return {say:'Continuing.',quiet:true,tour:true}}
    if(/\b(stop|exit|end|quit|cancel|skip|no thanks|enough)\b/.test(t)){endTour(true);return {say:'Okay, I stopped the tour. Tell me where you want to go anytime.',quiet:true}}
  }
  const v=parseNav(t),verb=/\b(go to|go|open|take me|show me|bring me|navigate|switch to|visit|where is|where s|how do i use|how to use|explain|teach me|tell me about|what is|what does)\b/.test(t);
  if(v&&(verb||t.trim().split(' ').length<=3)){
    if(!S.guide&&!T.on)return {say:'I can take you around when you ask me to guide you again. Just say, guide me again on how to use the system. You can also open any page from the sidebar.'};
    return {say:'Taking you to '+LABEL[v]+'. '+showPage(v)}}
  return null;
};
podium.ctx0=null;
podium.ctx=()=>{const p=S.pres[0],a=cap(),l=a.at(-1),f=a[0];return {user:S.u.name,presentations:S.pres.map(x=>({title:x.t,file:x.file?x.file.name:null,readinessPercent:readiness(x),practiceSessions:att(x),targetMinutes:Math.round(x.target/60),date:x.left!=null?x.date+' '+x.time:'not scheduled'})),next:p?{title:p.t,when:p.left!=null?p.date+' at '+p.time+', in '+p.left+' days':'no date set',target:Math.round(p.target/60)+' minutes'}:null,latestSession:l?{presentation:l.deck,date:l.d,duration:fmt(l.dur),wordsPerMinute:l.wpm,fillerWords:l.fill,longPauses:l.pau,score:l.score}:null,firstSession:f&&f!==l?{wordsPerMinute:f.wpm,fillerWords:f.fill,longPauses:f.pau,score:f.score}:null,pageGuide:GUIDE,goals:S.goals.map(g=>g.t+' ('+PTWorkspaceModel.goal(g,S.ses).percent+'%)'),aiCoachPriority:l?.analysis?.feedback?.recommendations?.[0]||null}};
/* ---------- small components ---------- */
const ring=(p,sz,lab)=>`<div class="rg2" style="width:${sz}px;height:${sz}px"><svg viewBox="0 0 120 120" aria-hidden="true"><circle class="trk2" cx="60" cy="60" r="52"/><circle class="dp2" cx="60" cy="60" r="52" data-p="${p}"/></svg><div class="tt"><b data-n="${p}" data-s="%">${p}%</b>${lab?`<span>${lab}</span>`:''}</div></div>`;
const spark=(v,c)=>{if(v.length<2)return'';const mx=Math.max(...v),mn=Math.min(...v),r=mx-mn||1;return `<svg viewBox="0 0 60 26" class="sp" aria-hidden="true"><polyline class="ln" pathLength="1" points="${v.map((a,i)=>(4+i*52/(v.length-1))+','+(22-(a-mn)/r*18)).join(' ')}" fill="none" stroke="${c}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`};
const sec=(t,i,body,cls='')=>`<section class="pn rise ${cls}" style="--i:${i}" data-sec="${String(t).toLowerCase().replace(/&[a-z]+;/g,'').replace(/[^a-z]+/g,'-').replace(/^-|-$/g,'')}"><h3 class="sh">${t}</h3>${body}</section>`;
const panel=(i,body,key)=>`<section class="pn rise" style="--i:${i}" data-sec="${key}">${body}</section>`;
const nodata=(txt,btn)=>`<p class="em">${txt}</p>${btn||''}`;
const sk=(h,w='100%')=>`<div class="sk" style="height:${h}px;width:${w}"></div>`;

function chart(key){
  const a=cap(),m=MET[key];if(!a.length)return nodata('Complete your first practice session to see your performance results.');
  const v=a.map(x=>x[key]);
  const W=440,H=220,L=66,R=30,T=26,B=42,mn=Math.min(...v),mx=Math.max(...v),pad=(mx-mn||mx*.1||1)*.4,lo=mn-pad,hi=mx+pad;
  const X=i=>L+30+(v.length===1?(W-L-R-60)/2:i*(W-L-R-60)/(v.length-1)),Y=x=>T+(1-(x-lo)/(hi-lo))*(H-T-B);
  const cl=x=>Math.max(lo,Math.min(hi,x));
  let g='';[lo+pad*.3,(lo+hi)/2,hi-pad*.3].forEach(t=>{g+=`<line x1="${L}" x2="${W-R}" y1="${Y(t)}" y2="${Y(t)}" class="gl"/><text x="${L-8}" y="${Y(t)+3}" text-anchor="end">${m.f(Math.round(t))}</text>`});
  if(key==='wpm')g+=`<rect x="${L}" width="${W-L-R}" y="${Y(cl(160))}" height="${Math.max(0,Y(cl(100))-Y(cl(160)))}" class="band"/><text x="${L+6}" y="${Y(cl(100))-5}" class="tg">Target 100 to 160</text>`;
  const chartTarget=S.pres.find(p=>String(p.id)===String(S.compareDeck))?.target;
  if(key==='dur'&&chartTarget>lo&&chartTarget<hi)g+=`<line x1="${L}" x2="${W-R}" y1="${Y(chartTarget)}" y2="${Y(chartTarget)}" class="tl"/><text x="${W-R}" y="${Y(chartTarget)-5}" text-anchor="end" class="tg">Target ${fmt(chartTarget)}</text>`;
  const pts=v.map((x,i)=>X(i)+','+Y(x)).join(' ');
  return `<svg viewBox="0 0 ${W} ${H}" class="cht" role="img" aria-label="${m.n} across ${v.length} attempts">${g}<polygon class="ar" points="${X(0)},${H-B} ${pts} ${X(v.length-1)},${H-B}"/><polyline class="ln2" pathLength="1" points="${pts}"/>${v.map((x,i)=>`<circle cx="${X(i)}" cy="${Y(x)}" r="6" class="pt"/><text x="${X(i)}" y="${Y(x)-14}" text-anchor="middle" class="pv">${m.f(x)}</text><text x="${X(i)}" y="${H-18}" text-anchor="middle">Attempt ${i+1}</text><text x="${X(i)}" y="${H-5}" text-anchor="middle" class="dm">${a[i].d}</text>`).join('')}</svg>`;
}
function interp(key){
  const a=cap();if(!a.length)return'';const f=a[0],l=a.at(-1),k=key;
  if(a.length<2)return 'Complete another attempt to see your trend.';
  return `${MET[k].n}: ${MET[k].f(f[k])} in the first session, ${MET[k].f(l[k])} in the latest (${a.length} analyzed sessions). A change in pace or duration is not automatically an improvement.`;
}
function chartBox(key){return `<div id="cwrap"><div class="chips" role="group" aria-label="Metric">${Object.keys(MET).map(k=>`<button type="button" class="chip2" data-act="metric" data-a="${k}" aria-pressed="${k===key}">${MET[k].n}</button>`).join('')}</div><div class="cbox" id="cbox">${chart(key)}</div><p class="ai" id="interp">${interp(key)?'<b>Session comparison</b> '+interp(key):''}</p></div>`}

function perfCards(){
  const a=cap();if(!a.length)return nodata('Complete your first practice session to see your performance results.');
  const f=a[0],l=a.at(-1),one=a.length<2;
  const row=(name,icn,val,unit,st,k,unitT,goodDir,lab,col)=>{const d=l[k]-f[k],distance=v=>v<100?100-v:v>160?v-160:0,good=k==='wpm'?distance(l[k])<=distance(f[k]):goodDir>0?d>=0:d<=0;
    return `<article class="mc"><header><span class="mi">${ic(icn)}</span><h4>${name}</h4></header><p class="mv"><span data-n="${val}">${val}</span>${unit}</p><span class="st ${st[1]}">${st[0]}</span>${one?'<p class="tr">First attempt</p>':`<p class="tr ${good?'up':'dn'}">${d<0?'↓':'↑'} ${Math.abs(d)}${unitT}</p><small>${lab}</small>`}${spark(a.map(x=>x[k]),col)}</article>`};
  const ps=l.wpm>160?['Too Fast','warn']:l.wpm<100?['Below reference','warn']:['Good Pace','ok'];
  return `<div class="g-perf">${row('Speaking Pace',I.pace,l.wpm,' <small>WPM</small>',ps,'wpm',' WPM',0,'Change from first attempt','#1570D0')}${row('Filler Words',I.fill,l.fill,'',[l.fill<f.fill?'Improving':'Needs work',l.fill<f.fill?'ok':'warn'],'fill',' fillers',0,'Change from first attempt','#E8930C')}${row('Long Pauses',I.pause,l.pau,'',[l.pau<=3?'Good':'Fair',l.pau<=3?'ok':'warn'],'pau',' pauses',0,'Change from first attempt','#12A382')}${row('Performance Score',I.star,l.score,'%',[l.score>=85?'Excellent':l.score>=70?'Good':'Keep going',l.score>=70?'ok':'warn'],'score','%',1,'Change from first attempt','#8A6BFF')}</div>`;
}
const recentRows=(list,more)=>list.length?`<div class="rp rh" role="row"><span>Presentation</span><span>Date</span><span>Duration</span><span>WPM</span><span>Fillers</span><span>Pauses</span><span>Score</span><span></span></div>${list.map(x=>`<div class="rp" role="row"><span data-l="Presentation"><b>${esc(x.deck)}</b>${!x.analysis&&!x.assess?'<small>Legacy / unverified measurements</small>':''}</span><span data-l="Date">${x.d}</span><span data-l="Duration">${fmt(x.dur)}</span><span data-l="WPM">${x.wpm} WPM</span><span data-l="Fillers">${x.fill}</span><span data-l="Pauses">${x.pau}</span><span data-l="Score"><b class="pill2">${x.score}%</b></span><span><button class="bt gh sm" data-go="rdet" data-a="${x.id}" type="button">VIEW REPORT</button></span></div>`).join('')}${more?`<div class="acts" style="margin-top:14px"><button class="bt" data-go="hist" type="button">VIEW ALL PRACTICE</button></div>`:''}`:nodata('No practice sessions yet.','<button class="bt" data-go="prac" type="button">START PRACTICE</button>');
const notesList=(n,more)=>n.length?`<div class="nl">${n.map((x,i)=>`<div class="nt ${x.r?'rd':''}"><span class="ne">${x.ic}</span><div><b>${esc(x.t)}</b><small>${esc(x.s)}</small></div></div>`).join('')}</div>${more?'<div class="acts" style="margin-top:12px"><button class="bt gh" data-go="note" type="button">VIEW ALL NOTIFICATIONS</button></div>':''}`:nodata("You're all caught up.");
const checklist=p=>PTWorkspaceModel.preparation(p,S.ses).items.map(([t,done])=>[t,done?'done':'todo']);
const readiness=p=>PTWorkspaceModel.preparation(p,S.ses).percent;
const stLab={done:'Completed',prog:'In Progress',todo:'Not Started'},stIc={done:'✓',prog:'◐',todo:'○'};
const chkHTML=p=>`<ul class="ck">${checklist(p).map(([t,s])=>`<li class="${s}"><span class="ci">${stIc[s]}</span>${t}<em>${stLab[s]}</em></li>`).join('')}</ul>`;

/* ---------- dashboard ---------- */
const greet=()=>{const h=new Date().getHours();return h<12?'Good morning':h<18?'Good afternoon':'Good evening'};
function skeleton(){return `<section class="pn" style="--i:0">${sk(34,'55%')}<div style="height:10px"></div>${sk(16,'40%')}</section><div class="g-next">${[1,2].map(()=>`<section class="pn">${sk(18,'35%')}<div style="height:12px"></div>${sk(26,'70%')}<div style="height:10px"></div>${sk(90)}</section>`).join('')}</div><div class="g-perf">${[1,2,3,4].map(()=>`<section class="pn">${sk(16,'50%')}<div style="height:10px"></div>${sk(34,'40%')}<div style="height:10px"></div>${sk(30)}</section>`).join('')}</div><div class="g-prog">${[1,2].map(()=>`<section class="pn">${sk(18,'40%')}<div style="height:12px"></div>${sk(150)}</section>`).join('')}</div><section class="pn">${sk(18,'30%')}<div style="height:12px"></div>${sk(110)}</section><section class="pn">${sk(18,'30%')}<div style="height:12px"></div>${sk(80)}</section><section class="pn">${sk(18,'30%')}<div style="height:12px"></div>${sk(70)}</section>`}
function dashHTML(){
  const p=S.pres[0],a=cap(),first=S.u.name.split(' ')[0];let h='';
  if(S.flash)h+=`<div class="bn ok rise" role="status"><span>✓</span><b>${esc(S.flash)}</b><button class="x" data-act="flashx" type="button" aria-label="Dismiss">×</button></div>`;
  else if(p&&p.left!=null&&!S.warnOff&&!p.final)h+=`<div class="bn warn rise" role="status"><span>⚠</span><b>Your presentation is in ${p.left} days. Consider completing another practice session.</b><button class="bt sm" data-go="prac" type="button">Practice now</button><button class="x" data-act="warnx" type="button" aria-label="Dismiss">×</button></div>`;
  h+=`<section class="wel rise"><h1>${greet()}, ${esc(first)}! 👋</h1><p class="sub">Ready to improve your presentation skills today?</p></section>`;
  if(!p)h+=pendingEval()?`<section class="pn rise hero0"><h2>Let's start with a quick evaluation!</h2><p class="sub">Talk for about 2 to 3 minutes so we can measure your speaking speed, filler words and long pauses. After that you can upload your slides.</p><div class="acts"><button class="bt" data-go="eval" type="button">START EVALUATION</button></div></section>`:`<section class="pn rise hero0"><h2>Let's prepare your first presentation!</h2><p class="sub">Upload your slides and start your first practice session.</p><div class="acts"><button class="bt" data-go="up" type="button">UPLOAD PPT</button></div></section>`;
  const nextC=p?sec('NEXT PRESENTATION',1,`<h2 class="pt">${esc(p.t)}</h2><p class="when">${p.left!=null?p.date+' · '+p.time:(p.file?esc(p.file.name):'No date set')}</p>${p.left!=null?`<div class="cdn"><b>${p.left} DAYS LEFT</b><div class="cdb" aria-hidden="true"><i style="--w:${Math.max(6,100-p.left/14*100)}%"></i></div></div>`:'<p class="wr">No date set for this presentation yet</p>'}<dl class="kv"><div><dt>Target Duration</dt><dd>${Math.round(p.target/60)} minutes</dd></div><div><dt>Practice Sessions</dt><dd>${att(p)} completed</dd></div><div><dt>Readiness</dt><dd>${readiness(p)}%</dd></div></dl>${p.final||p.left==null?'':'<p class="wr">⚠ Final rehearsal not completed</p>'}<div class="acts"><button class="bt gh" data-go="pdet" data-a="${p.id}" type="button">VIEW PRESENTATION</button><button class="bt" data-go="prac" type="button">PRACTICE NOW</button></div>`,'nx'):sec('NEXT PRESENTATION',1,nodata('No presentation scheduled yet.'),'nx');
  const readyC=p?sec('PRESENTATION READINESS',2,`<div class="rd0">${ring(readiness(p),128,'Ready')}<div class="rtxt"><b class="big"><span data-n="${readiness(p)}">${readiness(p)}</span>% Ready</b>${chkHTML(p)}</div></div><div class="acts"><button class="bt gh" data-go="ready" data-a="${p.id}" type="button">VIEW CHECKLIST</button></div>`):sec('PRESENTATION READINESS',2,nodata('Your checklist appears after you create a presentation.'));
  h+=`<div class="g-next">${nextC}${readyC}</div>`;
  h+=sec('PERFORMANCE OVERVIEW',3,perfCards(),'flat');
  const k=S.metric||'wpm';
  h+=`<div class="g-prog">${sec('YOUR PERFORMANCE PROGRESS',4,a.length?chartBox(k)+'<div class="acts"><button class="bt gh" data-go="prog" type="button">VIEW FULL PROGRESS</button></div>':nodata('Complete your first practice session to see your performance results.'))}${coachC(a)}</div>`;
  h+=sec('RECENT PRACTICE',5,recentRows(S.ses.slice(-4).reverse(),true));
  h+=sec('QUICK ACTIONS',6,quick());
  h+=sec('NOTIFICATIONS',7,notesList(S.notes.slice(0,3),true));
  h+=`<section class="pn rise cont" style="--i:8"><div><h3 class="sh">CONTINUE PRACTICING</h3><p class="sub" style="margin:0">Keep your momentum going. Every run-through makes the real thing easier.</p></div><button class="bt" data-go="prac" type="button">PRACTICE NOW</button><button class="bt gh" data-act="robotmin" type="button" id="rbtn">Minimize robot</button></section>`;
  return h;
}
function coachC(a){const last=a.at(-1),feedback=last?.analysis?.feedback;return `<section class="pn rise coach"><div class="cbadge">${ic(I.goal)}</div><h3 class="sh">AUTOMATED PRESENTATION COACH</h3>${feedback?`<h2 class="pt">Your next practice focus</h2><p class="rec">${esc(feedback.recommendations[0]||'Keep practicing your delivery.')}</p><p class="basis">Based on your latest analyzed session. Transcription-based measurements are estimates.</p><div class="acts"><button class="bt" data-go="weak" data-a="${last.deckId||''}" type="button">PRACTICE THIS AREA</button><button class="bt gh" data-go="coach" type="button">VIEW FEEDBACK</button></div>`:nodata('Complete an analyzed practice session to receive personalized feedback.')}</section>`}

const quick=()=>`<div class="qg">${[['New Presentation','Create Presentation','create',I.plus],['Practice','Start Practice','prac',I.prac],['Upload PPT','Upload Presentation','up',I.up],['Upload Recording','Analyze Recording','rec',I.vid],['Reports','View Reports','rep',I.rep],['Goals','Manage Goals','goals',I.goal]].map(([t,d,g,i])=>`<button class="qa" data-go="${g}" type="button"><span class="mi">${ic(i)}</span><b>${t}</b><small>${d}</small></button>`).join('')}</div>`;

/* ---------- modules ---------- */
const page=(t,sub,body)=>`<h1 class="rise">${t}</h1><p class="sub rise">${sub||''}</p>${body}`;
const find=id=>S.pres.find(x=>x.id==id)||S.pres[0];
const sesById=id=>S.ses.find(x=>x.id==id)||S.ses.at(-1);

/* ---------- My Presentations: cards, delete, previews, practice gate ---------- */
const pendingEval=()=>window.PTCloud&&PTCloud.enabled?!PTCloud.assessmentDone:!!(S.evalRequired&&!(S.ev&&S.ev.done));   /* cloud: ONLY the server flag (user_data.initial_assessment_completed) unlocks. S.ev is user-editable, so it is ignored. Either flow sets PTCloud.assessmentDone after the server accepts it. */
const gated=()=>pendingEval();
const fdate=iso=>{const d=new Date(iso);return isNaN(d)?'':d.toLocaleDateString('en',{month:'short',day:'numeric',year:'numeric'})};
const gatePage=t=>page(t,'One quick step comes first.',`<section class="pn rise gate" style="--i:1"><h3 class="sh">EVALUATION REQUIRED</h3><p class="sub" style="margin:0 0 14px">Before you upload and practice your own presentations, take the short speaking evaluation. It takes about 3 minutes and shows us how fast you speak, how many filler words you use and how long your pauses are.</p><div class="acts"><button class="bt" data-go="eval" type="button">START EVALUATION</button><button class="bt gh" data-go="decks" type="button">My Presentations</button></div></section>`);
function thumbOf(p){
  if(p.thumb)return `<img class="th" src="${p.thumb}" alt="Preview of ${esc(p.t)}">`;
  if(p.preview&&(p.preview.title||(p.preview.lines||[]).length))return `<div class="th pv" aria-label="Preview of ${esc(p.t)}"><b>${esc(p.preview.title||p.t)}</b>${(p.preview.lines||[]).slice(0,3).map(l=>`<span>${esc(l)}</span>`).join('')}</div>`;
  const t=p.file?ftype(p.file.name):{l:'Draft',c:'ppt'};return `<div class="th pv ph" aria-hidden="true"><b>${esc(t.l)}</b></div>`}
function deckCard(p,i){
  const t=p.file?ftype(p.file.name):{l:'Draft',c:'ppt'},busy=S.deleting==p.id,n=att(p);
  const when=p.created?'Added '+fdate(p.created):(p.left!=null?p.date:'');
  const stat=gated()?['Practice unlocks after the evaluation','warn']:n?[n+(n===1?' practice session':' practice sessions'),'ok']:['Not practiced yet',''];
  return `<section class="pn rise dcard" style="--i:${i+2}" data-pid="${p.id}">${thumbOf(p)}<div class="dk"><span class="ftp ${t.c}">${t.l}</span><div class="dkt">${S.ren===p.id?`<input type="text" id="rtitle" value="${esc(p.t)}" maxlength="80" aria-label="Presentation title"><div class="acts" style="margin-top:8px"><button class="bt sm" id="rs2" data-act="rsave" data-a="${p.id}" type="button">SAVE</button><button class="bt gh sm" data-act="rcancel" type="button">Cancel</button></div>`:`<b>${esc(p.t)}</b><small>${p.file?esc(p.file.name)+' · '+fsize(p.file.size):'No file yet'}</small>${when?`<small>${esc(when)}</small>`:''}`}</div></div>
  <div class="rd0">${ring(readiness(p),84,'Ready')}<div><p class="sub" style="margin:0 0 8px"><span class="st ${stat[1]}">${busy?'Deleting…':stat[0]}</span></p><div class="acts"><button class="bt sm" data-go="prac" data-a="${p.id}" type="button"${busy?' disabled':''}>PRACTICE</button><button class="bt gh sm" data-act="del" data-a="${p.id}" type="button"${busy?' disabled':''}>DELETE</button><button class="bt gh sm" data-go="pdet" data-a="${p.id}" type="button"${busy?' disabled':''}>DETAILS</button><button class="bt gh sm" data-act="ren" data-a="${p.id}" type="button"${busy?' disabled':''}>RENAME</button></div></div></div></section>`}
function deckList(){
  const a=podium.assessCard?podium.assessCard(2):'';
  if(!S.pres.length&&!a)return sec('YOUR PRESENTATIONS',2,nodata('No presentation uploaded yet.','<p class="sub" style="margin:0">Add your first file above.</p>'));
  return `<div class="g2">${a}${S.pres.map((p,i)=>deckCard(p,i+1)).join('')}</div>`}
/* confirmation dialog: Cancel is focused first so Enter or a stray click never deletes by accident */
function confirmDlg({title,text,yes='Delete'}){return new Promise(res=>{
  const m=document.createElement('div');m.className='modal';m.innerHTML=`<div class="mc" role="alertdialog" aria-modal="true" aria-labelledby="cdt" aria-describedby="cdx"><h2 id="cdt"></h2><p id="cdx" style="color:var(--muted)"></p><div class="acts" style="justify-content:flex-end;margin-top:14px"><button class="bt gh" data-r="0" type="button">Cancel</button><button class="bt dnb" data-r="1" type="button"></button></div></div>`;
  m.querySelector('#cdt').textContent=title;m.querySelector('#cdx').textContent=text;m.querySelector('[data-r="1"]').textContent=yes;
  const prev=document.activeElement,done=v=>{document.removeEventListener('keydown',k,true);m.remove();try{prev&&prev.focus&&prev.focus()}catch(e){}res(v)};
  const k=e=>{if(e.key==='Escape'){e.stopPropagation();done(false)}else if(e.key==='Tab'){const b=[...m.querySelectorAll('button')],i=b.indexOf(document.activeElement);e.preventDefault();b[(i+(e.shiftKey?-1:1)+b.length)%b.length].focus()}};
  m.onclick=e=>{const b=e.target.closest('[data-r]');if(b)done(b.dataset.r==='1');else if(e.target===m)done(false)};
  document.addEventListener('keydown',k,true);$('app').appendChild(m);m.querySelector('[data-r="0"]').focus()})}
async function delPres(id){
  const p=S.pres.find(q=>q.id==id);if(!p||S.deleting)return;
  if(!await confirmDlg({title:'Delete presentation?',text:'Are you sure you want to delete this presentation? This action cannot be undone.',yes:'Delete'}))return;
  const cloud=window.PTCloud&&PTCloud.enabled;S.deleting=p.id;render();
  const fail=m=>{S.deleting=null;render();toast(m)};
  if(cloud&&p.path){const r=await PTCloud.remove([p.path,p.slidePath].filter(Boolean));if(r.error)return fail('Could not delete the file. Nothing was removed. Please try again.')}
  const i=S.pres.indexOf(p);if(i>=0)S.pres.splice(i,1);
  if(cloud){const r=await PTCloud.saveNow(podium.snapshot());if(r.error){S.pres.splice(i,0,p);return fail('Could not delete this presentation. Please try again.')}}
  else podium.save();
  delete FILES[p.id];delete SLIDE_FILES[p.id];S.deleting=null;if(S.ren===p.id)S.ren=null;render();flash('Presentation deleted.','success');toast('Presentation deleted');
}
/* Thumbnail is rendered from the display PDF, never reconstructed from slide text. */
async function makePreview(file){
  try{
    if(/\.pdf$/i.test(file.name)){const d=await pdfDeck(file),h=document.createElement('div');h.style.cssText='position:absolute;left:-9999px;top:0;width:360px';document.body.appendChild(h);
      try{const c=await d.show(0,h,220),o=document.createElement('canvas'),w=320;o.width=w;o.height=Math.round(w*c.height/c.width);o.getContext('2d').drawImage(c,0,0,o.width,o.height);return{thumb:o.toDataURL('image/jpeg',.6)}}finally{h.remove()}}
  }catch(e){}
  return{}}
const V={
dash:()=>S.loading?skeleton():(podium.assessBanner?podium.assessBanner():'')+(podium.baselineBanner?podium.baselineBanner():'')+dashHTML(),
decks:()=>page('My Presentations','Upload a PDF or PowerPoint file. Your original file is kept unchanged.',(pendingEval()?sec('EVALUATION FIRST',1,`<div class="fr" style="max-width:600px;margin:0 auto;text-align:center"><p class="sub" style="margin:0">Before you upload a presentation, take the short speaking evaluation (about 3 minutes). It measures your speaking speed, filler words and long pauses, so we know how to analyze your presentations.</p><div class="acts" style="justify-content:center"><button class="bt" data-go="eval" type="button">START EVALUATION</button></div></div>`):sec('UPLOAD A PRESENTATION',1,`<div class="fr" style="max-width:600px;margin:0 auto"><div><label for="ut" style="text-align:center">Presentation title</label><input type="text" id="ut" style="text-align:center" placeholder="Type your own title" maxlength="80" autocomplete="off"></div><label class="drop" id="dz" for="f"><b>Drop files here or select them together</b><span id="fn">One PDF, or a PPTX with its matching PDF export</span></label><input type="file" id="f" accept=".pdf,.pptx" multiple hidden><p class="hint">For PowerPoint, select the PPTX and its matching PDF together in this one upload area. The PDF preserves your slide layout; both original files are kept unchanged.</p><div class="acts" style="justify-content:center"><button class="bt" id="ua" type="button">ADD PRESENTATION</button><button class="bt gh" id="uc" type="button">Cancel</button></div></div>`))+deckList()),
pdet:a=>{const p=find(a);if(!p)return V.decks();const l=S.ses.filter(x=>x.deck===p.short);return page(esc(p.t),(p.file?esc(p.file.name)+' · '+fsize(p.file.size):'')+(p.left!=null?' · '+p.date+' · '+p.time+' · '+p.left+' days left':''),`<div class="g-next">${sec('OVERVIEW',1,`<dl class="kv"><div><dt>Target Duration</dt><dd>${Math.round(p.target/60)} minutes</dd></div><div><dt>Practice Sessions</dt><dd>${l.length} completed</dd></div><div><dt>Readiness</dt><dd>${readiness(p)}%</dd></div></dl><div class="acts"><button class="bt" data-go="prac" data-a="${p.id}" type="button">PRACTICE NOW</button><button class="bt gh" data-go="up" type="button">UPLOAD PPT</button></div>`)}${sec('READINESS',2,chkHTML(p)+`<div class="acts"><button class="bt gh" data-go="ready" data-a="${p.id}" type="button">VIEW CHECKLIST</button></div>`)}</div>`+sec('PRACTICE SESSIONS',3,recentRows(l.slice().reverse(),false)))},
ready:a=>{const p=find(a);if(!p)return V.decks();return page('Presentation Readiness',esc(p.t),`<div class="g-next">${sec('OVERALL',1,`<div class="rd0">${ring(readiness(p),150,'Ready')}<p class="sub" style="margin:0">${p.final?'Final rehearsal recorded. Readiness reflects preparation activities, not a guarantee of performance.':'Complete the checklist to document your preparation.'}</p></div>`)}${sec('CHECKLIST',2,chkHTML(p)+`<div class="acts"><button class="bt" data-go="prac" data-a="${p.id}" type="button">START FINAL REHEARSAL</button></div>`)}</div>`)},
rec:()=>gated()?gatePage('Upload Recording'):page('Upload Recording','Get a full analysis of a rehearsal you recorded.',sec('ANALYZE RECORDING',1,`<div class="fr recording-form"><div><label for="rs">1. Choose a presentation</label><select id="rs">${S.pres.map(p=>`<option value="${p.id}">${esc(p.t)}</option>`).join('')||'<option value="">Create a presentation first</option>'}</select></div><label class="drop" id="dz" for="f"><span class="recording-upload-icon" aria-hidden="true">${ic(I.up)}</span><b>2. Choose or drop your recording</b><span id="fn">MP3, M4A, WAV, OGG, WebM or MP4</span></label><input type="file" id="f" accept=".mp3,.m4a,.wav,.ogg,.webm,.mp4" hidden><div class="bar2" id="rb" hidden><i style="width:0%"></i></div><p class="sub" id="rt" style="margin:0" role="status"></p><label class="hint recording-consent"><input type="checkbox" id="rconsent"> Send audio and extracted presentation text to Groq for transcription and feedback, and audio to Gemini when configured for a verbatim filler check. Save the report to my account. Up to 25 MB / 10 minutes. Larger files use private temporary storage and are deleted after processing; interrupted cleanup may leave a temporary copy. MP3, M4A, WAV, OGG, WebM or MP4.</label><button class="bt" id="ra" type="button">ANALYZE RECORDING</button></div>`)),
prac:a=>practiceHTML(a,false),weak:a=>practiceHTML(a,true),
rep:()=>page('Reports','Open any session for a full breakdown.',sec('SESSION REPORTS',1,recentRows(S.ses.slice().reverse(),false))),
rdet:a=>{let x=sesById(a);if(!x)return V.rep();if(x.assess)return V.evres();if(x.analysis){const report=podium.measuredReport?.(x.analysis);if(!report)return page('Report','', `<p role="status">${esc(podium.reportLoadMessage?.()||'Loading measured feedback...')}</p>`);const m=report.metrics||{};x={...x,analysis:report,wpm:m.wpm??'Unavailable',fill:m.fillerCount??'Unavailable',pau:m.pauseCount??'Unavailable',score:report.score??'Unavailable'};}return page('Report: '+esc(x.deck),x.d+' · '+fmt(x.dur)+' of '+fmt(x.tg),`<div class="g-perf">${[['Speaking Pace',x.wpm+' WPM'],['Filler Words',x.fill],['Long Pauses',x.pau],['Performance Score',x.score+'%']].map(([n,v])=>`<article class="mc"><h4>${n}</h4><p class="mv">${v}</p></article>`).join('')}</div>`+(x.analysis?`<p class="basis">${esc(podium.fillerDetails(x.analysis.metrics))}</p>`:'')+sec('AUTOMATED FEEDBACK',2,`<ul class="tp">${tips(x).map(t=>`<li>${esc(t)}</li>`).join('')}</ul>${x.analysis?`<details><summary>Transcript and measurement quality</summary><p>${esc(x.analysis.transcript)}</p><p>${esc((x.analysis.quality?.warnings||[]).join(' '))}</p><p>Pace uses recognized words divided by recording length. Filler counts are estimates; transcription may omit fillers.</p></details>`:'<p class="basis">Legacy session: measurement provenance is unavailable.</p>'}<div class="acts"><button class="bt" data-act="pdf" data-a="${x.id}" type="button">DOWNLOAD PDF</button>${x.assess&&S.ev?'<button class="bt gh" data-go="evres" type="button">EVALUATION DETAILS</button>':'<button class="bt gh" data-go="prac" type="button">PRACTICE AGAIN</button>'}<button class="bt gh" data-go="hist" type="button">Back to history</button></div>`))},
perf:()=>page('Performance','How your delivery compares with your first attempt.',sec('PERFORMANCE OVERVIEW',1,perfCards(),'flat')+(cap().length>1?sec('FIRST VS LATEST',2,`<div class="tw"><table><tr><th>Metric</th><th>First</th><th>Latest</th></tr>${[['Speaking pace','wpm',v=>v+' WPM'],['Filler words','fill',v=>v],['Long pauses','pau',v=>v],['Duration','dur',fmt],['Score','score',v=>v+'%']].map(([n,k,f])=>`<tr><td>${n}</td><td>${f(cap()[0][k])}</td><td><b>${f(cap().at(-1)[k])}</b></td></tr>`).join('')}</table></div><div class="acts" style="margin-top:12px"><button class="bt gh" data-go="coach" type="button">VIEW AI FEEDBACK</button></div>`):'')),
prog:()=>{const k=S.metric||'wpm',a=cap();return page('Progress','Track every attempt toward your goals.',`<div class="g-prog">${sec('YOUR PERFORMANCE PROGRESS',1,a.length?chartBox(k):nodata('Complete your first practice session to see your performance results.'))}${sec('GOALS',2,goalsHTML()+'<div class="acts"><button class="bt gh" data-go="goals" type="button">MANAGE GOALS</button></div>')}</div>`+sec('ATTEMPTS',3,recentRows(a.slice().reverse(),false)))},
hist:()=>page('Practice History','Every session you have saved.',panel(1,recentRows(S.ses.slice().reverse(),false),'all-practice')),
note:()=>page('Notifications',unread()?unread()+' unread':"You're all caught up.",`<div class="acts" style="margin-bottom:12px"><button class="bt gh" data-act="markall" type="button">Mark all as read</button></div>`+panel(1,S.notes.length?`<div class="nl">${S.notes.map((x,i)=>`<div class="nt ${x.r?'rd':''}"><span class="ne">${x.ic}</span><div><b>${esc(x.t)}</b><small>${esc(x.s)}</small></div><button class="bt gh sm" data-act="tn" data-a="${i}" type="button">${x.r?'Mark unread':'Mark read'}</button></div>`).join('')}</div>`:nodata("You're all caught up."),'all-notifications')),
coach:()=>page('Automated Presentation Coach','Feedback from analyzed practice data.',coachC(cap())+(cap().length?sec('WEAK-POINT ANALYSIS',2,`<ul class="tp">${(cap().at(-1).analysis.feedback.improvements||[]).map(t=>`<li>${esc(t)}</li>`).join('')}</ul>`):'')),

goals:()=>page('Goals','Set targets and watch your progress.',sec('YOUR GOALS',1,goalsHTML()+`<div class="fr" style="margin-top:14px;max-width:520px"><div><label for="gn">New goal</label><input type="text" id="gn" placeholder="Keep my introduction under 2 minutes"></div><div class="acts"><button class="bt" id="ga" type="button">ADD GOAL</button></div></div>`)),
set:()=>page('Settings','Manage your profile, preferences and prototype states.',`<div class="g2">${sec('PROFILE',1,`<div class="fr"><div class="pf"><img id="sp" src="${pic()}" alt="Your profile picture"><button class="bt gh" id="cp" type="button">Change picture</button></div><div><label for="sn">Full name</label><input type="text" id="sn" value="${esc(S.u.name)}"></div><div><label for="se">Email</label><input type="email" id="se" value="${esc(S.u.email)}"></div><button class="bt" id="ss" type="button">Save changes</button></div>`)}${sec('PREFERENCES',2,`<div class="fr"><label class="sw"><input type="checkbox" checked> Email me practice reminders</label><label class="sw"><input type="checkbox" checked> Show weekly report notifications</label><div><button class="bt gh" data-act="tour" type="button">Replay guided tour</button></div><label class="sw"><input type="checkbox" id="rv"${podium.voiceOn===false?'':' checked'}> Robot speaks aloud</label><div><button class="bt gh" id="st" type="button">Switch light / dark theme</button></div></div>`)}</div>`+sec('PROTOTYPE STATES',3,`<p class="sub" style="margin:0 0 8px">Dashboard state</p><div class="chips">${[['default','Default'],['empty','New user'],['loading','Loading'],['success','Success'],['warning','Warning']].map(([k,l])=>`<button class="chip2" type="button" data-act="state" data-a="${k}">${l}</button>`).join('')}</div><p class="sub" style="margin:14px 0 8px">Robot state</p><div class="chips">${[['idle','Idle'],['greeting','Greeting'],['encouraging','Encouraging'],['reminder','Reminder'],['success','Success'],['thinking','Thinking']].map(([k,l])=>`<button class="chip2" type="button" data-act="rstate" data-a="${k}">${l}</button>`).join('')}</div>`))
};
V.create=V.up=V.decks;
const goalsHTML=()=>S.goals.length?S.goals.map(g=>`<div class="gl2"><div class="gh2"><span>${esc(g.t)}</span><b>${g.p}%</b></div><div class="bar2"><i style="width:${g.p}%"></i></div></div>`).join(''):nodata('No goals yet. Add one below.');

/* practice module (setup + live practice) */
function practiceHTML(a,weak){
  if(gated())return gatePage(weak?'Weak-Point Practice':'Practice');
  const p=find(a),mins=Math.max(1,Math.min(240,Math.round((p?p.target:300)/60)));
  return page(weak?'Weak-Point Practice':'Practice',weak?'Use your latest feedback to focus this rehearsal, then finish for a new report.':'Set up your run-through, choose a target time, then press Start and speak out loud.',`<div class="pn rise" style="--i:1"><div class="pr psetup"><div class="rg"><svg viewBox="0 0 120 120"><circle class="dt" cx="60" cy="60" r="54"/><circle class="dp" id="pg" cx="60" cy="60" r="54"/></svg><div class="tt"><b id="pc">0:00</b><span id="pl">of ${mins}:00</span></div></div>
 <div class="pform"><div class="pgrid"><div class="pf"><label for="pd">Presentation</label><select id="pd">${S.pres.map(x=>`<option value="${x.id}"${p&&x.id===p.id?' selected':''}>${esc(x.t)}</option>`).join('')||'<option value="0">Quick practice</option>'}</select></div>
 <div class="pf"><label for="pdur">Target duration (minutes)</label><div class="dur"><input type="text" id="pdur" inputmode="numeric" maxlength="3" autocomplete="off" value="${mins}" aria-describedby="pmh"><span class="pill2">min</span></div></div></div>
 <div class="pf"><span class="plb" id="pql">Quick durations</span><div class="chips" id="pq" role="group" aria-labelledby="pql">${[3,5,10,15,20].map(m=>`<button class="chip2" data-m="${m}" type="button" aria-pressed="${m===mins}">${m} min</button>`).join('')}</div><p class="hint" id="pmh">Any whole number from 1 to 240.</p></div>
 <label class="hint"><input type="checkbox" id="pconsent"> I agree to send this recording and extracted presentation text to Groq for transcription and presentation feedback, and audio to Gemini when configured for a verbatim filler check. The report and transcript are saved to my account; larger recordings use private temporary storage with deletion after processing (interrupted cleanup may leave a temporary copy). Maximum 10 minutes / 25 MB.</label><div class="acts pacts"><button class="bt gh" id="prs" type="button">Reset</button></div></div></div>
 <div id="pres"></div></div><section class="pn rise" id="vw" style="--i:2"><div class="vwh"><h3 class="sh">YOUR SLIDES</h3><span id="vc"></span></div><div class="vst" id="vst" aria-live="polite"></div><div class="vctl" id="vctl"><div class="vtm" id="vtmw" hidden aria-label="Elapsed time"><b id="vtm">0:00</b><small id="vtl"></small></div><div class="vbt" role="group" aria-label="Presentation controls"><button class="bt gh sm vic" id="vb" type="button" aria-label="Previous slide" data-tip="Previous slide"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></button><button class="bt sm vic" id="vn" type="button" aria-label="Next slide" data-tip="Next slide"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></button><button class="bt gh sm" id="vfs" type="button">Start</button><button class="bt gh sm" id="vpr" type="button" hidden>Pause</button><button class="bt sm vfin" id="vfin" type="button" hidden>Finish</button></div><p class="vnote" id="vnote" role="status"></p></div><p class="basis tip" style="margin:10px 0 0;text-align:center">Tip: use the ← → keys or swipe to change slides.</p></section>`)}
/* Read-only PDF viewer. PowerPoint originals use their attached PDF export. */
const FILES={},SLIDE_FILES={},LIB={pdfgen:'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',pdf:'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',zip:'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',doc:'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js'};
const lib=k=>LIB[k+'p']||(LIB[k+'p']=new Promise((ok,no)=>{const s=document.createElement('script');s.src=LIB[k];s.onload=ok;s.onerror=()=>{LIB[k+'p']=0;no(new Error('Could not load the viewer. Check your internet connection.'))};document.head.appendChild(s)}));
async function pdfDeck(file){await lib('pdf');pdfjsLib.GlobalWorkerOptions.workerSrc=LIB.pdf.replace('pdf.min.js','pdf.worker.min.js');
  const doc=await pdfjsLib.getDocument({data:await file.arrayBuffer()}).promise;
  return{n:doc.numPages,async show(i,host,mh){const pg=await doc.getPage(i+1),v0=pg.getViewport({scale:1}),r=devicePixelRatio||1,cs=getComputedStyle(host),s=Math.min(Math.max(host.clientWidth-(parseFloat(cs.paddingLeft)||0)-(parseFloat(cs.paddingRight)||0),200)/v0.width,mh/v0.height),v=pg.getViewport({scale:s*r}),c=document.createElement('canvas');
    c.width=v.width;c.height=v.height;c.style.width=v.width/r+'px';c.style.height=v.height/r+'px';await pg.render({canvasContext:c.getContext('2d'),viewport:v}).promise;return c}}}
let VD=null,VI=0,VT=0,VS=0,PR=null;
const fsEl=()=>document.fullscreenElement||document.webkitFullscreenElement;
const inFS=()=>{const v=$('vw');return !!v&&v.classList.contains('fs')};
const vnote=m=>{const n=$('vnote');if(!n)return;n.textContent=m;clearTimeout(n._t);n._t=setTimeout(()=>{n.textContent=''},2800)};
/* one place that decides which presentation buttons are visible/enabled */
function vui(){const vw=$('vw');if(!vw)return;const fs=inFS(),n=VD?VD.n:0,last=n>0&&VI>=n-1;
  const selected=S.pres.find(x=>x.id==$('pd')?.value),withoutSlides=!selected?.file;
  $('vb').disabled=!n||VI<=0;$('vn').disabled=!n||last;$('vfs').disabled=!n&&!withoutSlides;$('vfs').textContent=fs?'Exit full screen':'Start';
  $('vtmw').hidden=!fs;$('vpr').hidden=!fs;$('vfin').hidden=!fs;
  if(PR){PR.sync();PR.draw()}}
function fsChanged(){vui();clearTimeout(window.__vr);window.__vr=setTimeout(vshow,80)}
/* fallback for browsers without the Fullscreen API (e.g. iPhone Safari): fill the window instead */
function fsFallback(on){const vw=$('vw');if(!vw)return;vw.classList.toggle('fs',on);vw.classList.toggle('fsx',on);document.body.classList.toggle('vfsx',on);fsChanged()}
function setFS(on){const vw=$('vw');if(!vw)return;
  if(on){const rq=vw.requestFullscreen||vw.webkitRequestFullscreen;if(!rq)return fsFallback(true);
    try{const r=rq.call(vw);if(r&&r.catch)r.catch(()=>fsFallback(true))}catch(e){fsFallback(true)}}
  else if(vw.classList.contains('fsx'))fsFallback(false);
  else if(fsEl())(document.exitFullscreen||document.webkitExitFullscreen).call(document)}
async function vshow(){const d=VD,host=$('vst');if(!d||!host)return;const my=++VS;VI=Math.max(0,Math.min(d.n-1,VI));$('vc').textContent='Slide '+(VI+1)+' / '+d.n;vui();
  const cs=getComputedStyle(host),mh=inFS()?Math.max(200,host.clientHeight-(parseFloat(cs.paddingTop)||0)-(parseFloat(cs.paddingBottom)||0)-2):Math.max(260,innerHeight*.6);
  try{const el=await d.show(VI,host,mh);if(my===VS)host.replaceChildren(el)}catch(e){if(my===VS)host.textContent='Could not draw this slide.'}}
const vgo=k=>{if(VD){VI+=k;vshow()}};
async function viewer(){const host=$('vst');if(!host)return;const my=++VT;VD=null;VI=0;VS++;document.body.classList.remove('vfsx');
  document.querySelectorAll('#vw .slide-context').forEach(el=>el.remove());
  const msg=t=>{host.replaceChildren();const e=document.createElement('p');e.className='em';e.textContent=t;host.appendChild(e);$('vc').textContent='';vui()};
  $('vb').onclick=()=>vgo(-1);$('vn').onclick=()=>vgo(1);$('vfs').onclick=()=>{if(inFS())return setFS(false);if(!$('pconsent').checked){toast('Agree to audio processing above before starting.');$('pconsent').focus();return}setFS(true);PR?.autostart()};
  $('vpr').onclick=()=>PR&&PR.toggle();$('vfin').onclick=()=>PR&&PR.finish();
  let sx=null;host.ontouchstart=e=>{sx=e.touches[0].clientX};host.ontouchend=e=>{if(sx===null)return;const dx=e.changedTouches[0].clientX-sx;sx=null;if(Math.abs(dx)>50)vgo(dx<0?1:-1)};
  if(!window.__vk){window.__vk=1;
    document.addEventListener('keydown',e=>{const vw=$('vw');if(!vw)return;
      if(e.key==='Escape'&&vw.classList.contains('fsx')){fsFallback(false);return}
      if(!VD||e.ctrlKey||e.metaKey||e.altKey||/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName))return;
      if(e.key==='ArrowRight'||e.key==='PageDown'){vgo(1);e.preventDefault()}else if(e.key==='ArrowLeft'||e.key==='PageUp'){vgo(-1);e.preventDefault()}});
    const onFS=()=>{const vw=$('vw');if(!vw)return;if(!vw.classList.contains('fsx'))vw.classList.toggle('fs',fsEl()===vw);fsChanged()};
    document.addEventListener('fullscreenchange',onFS);document.addEventListener('webkitfullscreenchange',onFS);
    addEventListener('resize',()=>{clearTimeout(window.__vr);window.__vr=setTimeout(vshow,200)})}
  const p=S.pres.find(x=>x.id==$('pd').value);let f=p&&(p.slideFile?SLIDE_FILES[p.id]:FILES[p.id]);
  if(!f&&p&&(p.slidePath||p.path)&&window.PTCloud&&PTCloud.enabled){msg('Loading '+p.file.name+'\u2026');const r=await PTCloud.download(p.slidePath||p.path);if(my!==VT)return;if(r.error)return msg('Could not load this file. '+r.error);f=new File([r.blob],(p.slideFile||p.file).name);if(p.slideFile)SLIDE_FILES[p.id]=f;else FILES[p.id]=f}
  if(!f)return msg(p&&p.file?'The file for this presentation isn\u2019t loaded in this session. Upload it again in My Presentations to see it here.':'No file attached to this presentation yet.');
  if(!/\.pdf$/i.test(f.name)){
    msg('Your original file is unchanged. Attach a PDF exported from this presentation to display its layout.');
    const label=document.createElement('label');label.className='bt gh';label.textContent='Attach slide PDF';
    const input=document.createElement('input');input.type='file';input.accept='.pdf';input.hidden=true;label.appendChild(input);host.appendChild(label);
    input.onchange=async()=>{
      const pdf=input.files[0];if(!pdf)return;
      if(!/\.pdf$/i.test(pdf.name)||pdf.size>50000000){toast('Choose a PDF up to 50 MB.');return}
      input.disabled=true;
      try{
        await lib('pdf');pdfjsLib.GlobalWorkerOptions.workerSrc=LIB.pdf.replace('pdf.min.js','pdf.worker.min.js');
        const context=await PTPresentationContent.scan(pdf,{pdf:pdfjsLib});if(my!==VT)return;
        let slidePath=null;
        if(window.PTCloud?.enabled){slidePath=PTCloud.user.id+'/uploads/'+crypto.randomUUID()+'.slides.pdf';const saved=await PTCloud.upload(slidePath,pdf);if(saved.error)throw Error('Could not upload the slide PDF.');}
        p.slidePath=slidePath;p.slideFile={name:pdf.name,size:pdf.size};p.context=context;SLIDE_FILES[p.id]=pdf;podium.save();
        if(my===VT)viewer();
      }catch(e){toast(e.message||'Could not attach this PDF.');input.disabled=false}
    };return;
  }
  msg('Loading '+f.name+'\u2026');
  try{const d=await pdfDeck(f);if(my!==VT)return;
    if(p&&!p.context){const context=await PTPresentationContent.scan(f,{pdf:pdfjsLib});if(my===VT){p.context=context;podium.save()}}
    if(my!==VT)return;VD=d;vshow();
    if(my===VT&&p){const notice=document.createElement('p');notice.className='basis slide-context';notice.textContent=p.context?.text?'Presentation text is ready for feedback. The displayed PDF is unchanged.':'No readable slide text was found. Your slides are unchanged; feedback will cover delivery only.';$('vw').appendChild(notice)}
  }catch(e){if(my===VT)msg(e.message||'Could not open this file.')}}
const B={
decks:()=>{if(!$('f')){const r=$('rtitle');if(r){r.focus();r.select();r.onkeydown=e=>{if(e.key==='Enter')$('rs2').click();if(e.key==='Escape'){S.ren=null;render()}}}return}let file=null,slideFile=null;const f=$('f'),dz=$('dz'),ok=/\.(pdf|pptx)$/i;
  const cancel=$('uc'),title=$('ut');
  const uploadBusy=on=>{S.uploading=on;cancel.disabled=title.disabled=f.disabled=on;};
  const reset=()=>{file=null;slideFile=null;f.value='';$('fn').textContent='One PDF, or a PPTX with its matching PDF export';};
  cancel.onclick=()=>{if(S.uploading)return;reset();title.value='';dz.classList.remove('hv');title.focus();};
  const reject=message=>{reset();toast(message)};
  const pk=files=>{if(S.uploading)return;try{const chosen=PTPresentationContent.selectUpload(files);file=chosen.file;slideFile=chosen.slideFile;
    $('fn').textContent=[file,slideFile].filter(Boolean).map(x=>x.name+' - '+fsize(x.size)).join(' + ');
    if(!slideFile&&/\.pptx$/i.test(file.name))$('fn').textContent+=' - select this PPTX and its matching PDF together';
    if(!title.value.trim())title.value=file.name.replace(/\.[^.]+$/,'');
  }catch(error){reject(error.message)}};
  f.onchange=()=>f.files.length&&pk(f.files);dz.ondragover=e=>{e.preventDefault();if(!S.uploading)dz.classList.add('hv')};dz.ondragleave=()=>dz.classList.remove('hv');dz.ondrop=e=>{e.preventDefault();dz.classList.remove('hv');if(e.dataTransfer.files.length)pk(e.dataTransfer.files)};
  $('ua').onclick=async()=>{if(pendingEval()){toast('Take the short speaking evaluation first.');go('eval');return}let t=$('ut').value.trim();if(S.uploading)return;if(!file){toast('Choose a PPTX or PDF file first');return}if(!ok.test(file.name)||/wordprocessingml|msword/i.test(file.type||'')){reject('Rejected: only .PPTX or .PDF files are allowed.');return}if(t.length<2){toast('Type a title for your presentation');return}
    if(S.pres.some(p=>p.short===t))t+=' (2)';
    if(/\.pptx$/i.test(file.name)&&!slideFile){toast('Select the PPTX and its matching PDF together in the upload area.');return}
    const cloud=window.PTCloud&&PTCloud.enabled,nid=S.nid++,btn=$('ua'),owner=PTCloud?.user?.id;let path=null,slidePath=null,context=null;uploadBusy(true);btn.disabled=true;btn.textContent='READING SLIDES...';
    try{const source=slideFile||file;await lib('pdf');pdfjsLib.GlobalWorkerOptions.workerSrc=LIB.pdf.replace('pdf.min.js','pdf.worker.min.js');context=await PTPresentationContent.scan(source,{pdf:pdfjsLib});}catch(e){uploadBusy(false);btn.disabled=false;btn.textContent='ADD PRESENTATION';toast(e.message||'Could not read this PDF. Use an unencrypted PDF.');return}
    // Prefer the original PPTX text for AI context; the display always uses
    // the user's PDF export. Legacy PPT uses text from that same export.
    if(/\.pptx$/i.test(file.name)){
      try{await lib('zip');const original=await PTPresentationContent.scan(file,{zip:JSZip});if(original.text.trim())context=original;}catch(e){uploadBusy(false);btn.disabled=false;btn.textContent='ADD PRESENTATION';toast(e.message||'This file is not a readable PPTX presentation.');return}
    }
    if($('ua')!==btn||(cloud&&PTCloud.user?.id!==owner)){uploadBusy(false);return}
    if(cloud){btn.textContent='UPLOADING…';
      path=PTCloud.user.id+'/uploads/'+nid+'-'+file.name.replace(/[^\w.\-]+/g,'_');
      let r;try{r=await PTCloud.upload(path,file);if(!r.error&&slideFile){slidePath=path+'.slides.pdf';const uploaded=await PTCloud.upload(slidePath,slideFile);if(uploaded.error){await PTCloud.remove([path]);r.error=uploaded.error}}}catch(e){r={error:'Check your connection and retry.'}}
      if(r.error){uploadBusy(false);toast('Upload failed. '+r.error);if($('ua')===btn){btn.disabled=false;btn.textContent='ADD PRESENTATION'}return}
      if(PTCloud.user?.id!==owner){uploadBusy(false);return}}
    FILES[nid]=file;if(slideFile)SLIDE_FILES[nid]=slideFile;const pv=await makePreview(slideFile||file);uploadBusy(false);
    S.pres.push(Object.assign({id:nid,t,short:t,file:{name:file.name,size:file.size},path,slidePath,slideFile:slideFile?{name:slideFile.name,size:slideFile.size}:null,context,created:new Date().toISOString(),date:'Not scheduled',time:'',target:600,ready:20,ppt:true,rq:false,sp:true,final:false,left:null},pv));
    notify('📄','Presentation added','"'+t+'" was uploaded.');flash('Presentation uploaded successfully!','success','Your file is in. Nice work!');toast('Presentation uploaded');go('decks')};
  const r=$('rtitle');if(r){r.focus();r.select();r.onkeydown=e=>{if(e.key==='Enter')$('rs2').click();if(e.key==='Escape'){S.ren=null;render()}}}},
rec:()=>{if(!$('ra'))return;let file=null;const f=$('f'),dz=$('dz'),pk=x=>{file=x;$('fn').textContent=x.name+' · '+(x.size/1048576).toFixed(1)+' MB'};
  f.onchange=()=>f.files[0]&&pk(f.files[0]);dz.ondragover=e=>{e.preventDefault();dz.classList.add('hv')};dz.ondragleave=()=>dz.classList.remove('hv');dz.ondrop=e=>{e.preventDefault();dz.classList.remove('hv');e.dataTransfer.files[0]&&pk(e.dataTransfer.files[0])};
  const controller=new AbortController();let disposed=false;podium.practiceCleanup=()=>{disposed=true;controller.abort()};
  $('ra').onclick=async()=>{const p=find($('rs').value);if(!p||!file){toast('Select a presentation and recording first.');return}if(!$('rconsent').checked){toast('Please consent to audio processing first.');return}
    $('ra').disabled=true;$('rt').textContent='Transcribing and analyzing your recording...';
    try{const result=await PTPracticeAudio.analyze(file,p.target,controller.signal,message=>{if(!disposed)$('rt').textContent=message},{title:p.t,text:p.context?.text||''});if(disposed)return;const m=result.metrics;
      const x={id:S.nid++,deckId:p.id,deck:p.short,d:today(),at:new Date().toISOString(),dur:Math.round(m.totalDurationSec),wpm:m.wpm,fill:m.fillerCount,pau:m.pauseCount,score:result.score,tg:p.target,analysis:result,source:'recorded-audio'};
      S.ses.push(x);p.rq=result.quality.level==='ok';p.ready=readiness(p);if(PTCloud.enabled){const saved=await PTCloud.saveNow(podium.snapshot());if(saved.error)toast('Cloud save failed. Keep this page open.')}else podium.save();go('rdet',x.id)
    }catch(e){if(!disposed){$('rt').textContent=e.message;$('ra').disabled=false}}}},

goals:()=>{$('ga').onclick=()=>{const t=$('gn').value.trim();if(!t){toast('Describe your goal first');return}S.goals.push({t,p:0});toast('Goal added');go('goals')}},
set:()=>{$('rv').onchange=e=>podium.setVoice&&podium.setVoice(e.target.checked);$('cp').onclick=()=>$('pic').click();$('st').onclick=()=>$('theme').click();
  $('ss').onclick=()=>{const n=$('sn').value.trim(),e=$('se').value.trim();if(n.length<2||!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)){toast('Enter a valid name and email');return}S.u.name=n;S.u.email=e;podium.name=n.split(' ')[0];renderShell();toast('Settings saved')}},
prac:()=>{if(!$('pdur'))return;let el=0,run=false,last=0,c={};let capture=new PTPracticeAudio.Capture(),busy=false,disposed=false;const controller=new AbortController();podium.practiceCleanup=()=>{disposed=true;controller.abort();capture.dispose();clearInterval(tm);VT++;VS++;VD=null;PR=null;document.body.classList.remove('vfsx')};
  const parse=v=>{const s=String(v).trim();if(!/^\d{1,3}$/.test(s))return null;const n=+s;return n>=1&&n<=240?n:null};
  let T0=(parse($('pdur').value)||5)*60;const tg=()=>T0,pick=()=>S.pres.find(x=>x.id==$('pd').value);
  const fillN=()=>Object.keys(c).filter(k=>k!=='__pause').reduce((s,k)=>s+c[k],0);
  const draw=()=>{const over=el>tg(),f=Math.min(el/tg(),1);
    if($('pc')){$('pc').textContent=fmt(el);$('pl').textContent=over?'+'+fmt(el-tg())+' over':'of '+fmt(tg());$('pg').style.strokeDashoffset=339.3*(1-f);$('pg').style.stroke=over?'var(--err)':'var(--brand)'}
    const t=$('vtm');if(t){t.textContent=fmt(el);$('vtmw').classList.toggle('over',over);$('vtmw').classList.toggle('paused',!run);
      $('vtl').textContent=(!run&&el?'Paused \u00b7 ':'')+(over?'+'+fmt(el-tg())+' over':'of '+fmt(tg()))}};
  const syncRun=()=>{if($('vpr')){$('vpr').textContent=run?'Pause':'Resume';$('vpr').disabled=busy;$('vpr').hidden=!inFS()&&!el&&!run}if($('vfin')){$('vfin').disabled=busy;$('vfin').hidden=!inFS()&&!el&&!run;}};
  const tick=()=>{if(!$('pc')){clearInterval(tm);run=false;return}const n=performance.now();el+=(n-last)/1000;last=n;draw()};
  const stop=()=>{capture.pause();if(run)el+=(performance.now()-last)/1000;run=false;clearInterval(tm);syncRun();draw()};
  const start=async()=>{if(run||busy)return;if(capture.blob){toast('Reset before starting a new recording.');return}if(!$('pconsent').checked){toast('Please consent to audio processing first.');return}busy=true;
    syncRun();try{window.PTVoice?.active&&PTVoice.stop();podium.hushNow?.();await capture.start();if(disposed)return;run=true;last=performance.now();$('pd').disabled=$('pdur').disabled=true;$('pres').innerHTML='';vnote('Recording. Speak naturally, then choose Finish.');clearInterval(tm);tm=setInterval(()=>{tick();if(el>=600)finish()},200);draw()}catch(e){toast(e.message||'Microphone access was blocked.');vnote(e.message||'Microphone access was blocked.')}finally{busy=false;if(!disposed)syncRun()}};
  const toggle=()=>run?stop():start();
  /* target duration: any whole number of minutes (1-240), saved on the presentation */
  const marks=()=>$$('#pq .chip2').forEach(b=>b.setAttribute('aria-pressed',String(+b.dataset.m*60===T0)));
  const hint=bad=>{$('pdur').setAttribute('aria-invalid',bad?'true':'false');$('pmh').textContent=bad?'Enter a whole number from 1 to 240.':'Any whole number from 1 to 240.';$('pmh').style.color=bad?'var(--err)':''};
  const setDur=m=>{if(run||el){toast('Reset the session before changing its target.');return}T0=m*60;const p=pick();if(p)p.target=T0;marks();draw()};
  $('pdur').oninput=()=>{const n=parse($('pdur').value);hint(n===null);if(n!==null)setDur(n)};
  $('pdur').onblur=()=>{if(parse($('pdur').value)===null){$('pdur').value=T0/60;hint(false)}};
  $$('#pq .chip2').forEach(b=>b.onclick=()=>{$('pdur').value=b.dataset.m;$('pdur').oninput()});
  $('pd').onchange=()=>{const p=pick();if(p&&!run&&!el){const m=Math.max(1,Math.min(240,Math.round(p.target/60)));$('pdur').value=m;hint(false);T0=m*60;marks();draw()}viewer()};
  $('prs').onclick=()=>{if(busy)return;stop();capture.dispose();capture=new PTPracticeAudio.Capture();$('pd').disabled=$('pdur').disabled=false;el=0;c={};$('pres').innerHTML='';syncRun();draw()};
  const finish=async()=>{if(busy||disposed)return;if(el<20){toast('Practice for at least 20 seconds first.');return}stop();busy=true;
    $('pres').textContent='Transcribing and analyzing your recording...';vnote('Transcribing and reviewing your presentation...');syncRun();
    try{const blob=await capture.finish();const analysis=await PTPracticeAudio.analyze(blob,tg(),controller.signal,undefined,{title:pick()?.t||'Quick practice',text:pick()?.context?.text||''});if(disposed)return;
      const p=pick(),m=analysis.metrics,x={id:S.nid++,deckId:p?.id,deck:p?p.short:'Quick practice',d:today(),at:new Date().toISOString(),dur:Math.round(m.totalDurationSec),wpm:m.wpm,fill:m.fillerCount,pau:m.pauseCount,score:analysis.score,tg:tg(),analysis,source:'recorded-audio'};
      S.ses.push(x);if(p){p.rq=analysis.quality.level==='ok';p.ready=readiness(p)}
      if(PTCloud.enabled){const saved=await PTCloud.saveNow(podium.snapshot());if(saved.error)toast('Report is in this session; cloud save failed. Keep this page open.')}else podium.save();
      capture.dispose();if(inFS())setFS(false);go('rdet',x.id);
    }catch(e){if(!disposed){$('pres').textContent=e.message+' Press Finish to retry the same recording.';vnote('Analysis could not finish. Choose Finish to retry.');toast('No report generated. Your recording is available to retry.')}}finally{busy=false;if(!disposed)syncRun()}};
  PR={sync:syncRun,draw,toggle,finish,autostart:()=>{if(!run)start()}};
  viewer();marks();syncRun();draw()}
};
B.create=B.up=B.decks;B.weak=B.prac;
/* ---- report as a PDF (generated in the browser; nothing is uploaded) ---- */
const pdfTxt=t=>String(t==null?'':t).replace(/[\u2018\u2019]/g,"'").replace(/[\u201C\u201D]/g,'"').replace(/[\u2013\u2014]/g,'-').replace(/[^\x20-\x7E\u00A0-\u00FF]/g,'');
async function downloadPdf(id){
  let x=sesById(id);if(!x){toast('Report not found');return}
  if(x.assess&&(x.source!=='recorded-evaluation'||x.contentValidation?.eligible!==true)){toast('Retake the recorded evaluation before exporting a baseline report.');return}
  const btn=document.querySelector('[data-act="pdf"]');if(btn){if(btn.disabled)return;btn.disabled=true;btn.textContent='PREPARING…'}
  const done=()=>{const b=document.querySelector('[data-act="pdf"]');if(b){b.disabled=false;b.textContent='DOWNLOAD PDF'}};
  try{
    if(x.analysis){await podium.loadMeasuredReport();const report=podium.measuredReport(x.analysis),m=report.metrics||{};x={...x,analysis:report,wpm:m.wpm,fill:m.fillerCount,pau:m.pauseCount,score:report.score};}
    await lib('pdfgen');const doc=new window.jspdf.jsPDF({unit:'mm',format:'a4'}),W=210,M=20,CW=W-2*M;let y=0;
    const sc=(x.score==null||isNaN(x.score))?'N/A':x.score+'%',ok=v=>v==null||(typeof v==='number'&&isNaN(v))?'N/A':v;
    const need=h=>{if(y+h>285){doc.addPage();y=20}};
    const text=(t,size,bold,color,gap)=>{doc.setFont('helvetica',bold?'bold':'normal');doc.setFontSize(size);doc.setTextColor(...(color||[11,37,64]));
      doc.splitTextToSize(pdfTxt(t),CW).forEach(l=>{need(size*.5);doc.text(l,M,y);y+=size*.5})
      y+=gap==null?3:gap};
    doc.setFillColor(21,112,208);doc.rect(0,0,W,26,'F');doc.setTextColor(255,255,255);doc.setFont('helvetica','bold');doc.setFontSize(18);doc.text('PresentTrack',M,16);
    doc.setFont('helvetica','normal');doc.setFontSize(10);doc.text('Practice report',W-M,16,{align:'right'});y=40;
    text('Report: '+x.deck,18,true,null,2);
    text(pdfTxt(x.d||'')+'  |  Length '+fmt(x.dur)+' of '+fmt(x.tg)+' target  |  '+(S.u.name||''),10,false,[72,101,127],8);
    doc.setFont('helvetica','bold');doc.setFontSize(12);doc.setTextColor(11,37,64);doc.text('Results',M,y);y+=6;
    const rows=[['Speaking pace',ok(x.wpm)+' WPM'],['Filler words',ok(x.fill)],['Long pauses',ok(x.pau)],['Duration',fmt(x.dur)+' (target '+fmt(x.tg)+')'],['Performance score',sc]];
    rows.forEach(([a,b],i)=>{if(i%2===0){doc.setFillColor(238,248,255);doc.rect(M,y-5,CW,8,'F')}doc.setFont('helvetica','normal');doc.setFontSize(11);doc.setTextColor(11,37,64);doc.text(a,M+3,y);doc.setFont('helvetica','bold');doc.text(pdfTxt(String(b)),M+CW-3,y,{align:'right'});y+=8});
    y+=6;doc.setFont('helvetica','bold');doc.setFontSize(12);doc.setTextColor(11,37,64);doc.text('Feedback',M,y);y+=7;
    tips(x).forEach(t=>{need(10);doc.setFillColor(21,112,208);doc.circle(M+1.5,y-1.2,.9,'F');doc.setFont('helvetica','normal');doc.setFontSize(11);doc.setTextColor(11,37,64);
      doc.splitTextToSize(pdfTxt(t),CW-6).forEach(l=>{need(6);doc.text(l,M+6,y);y+=5.5});y+=2});
    if(x.analysis?.comments){const comments=x.analysis.comments;need(24);y+=6;text('Comments on your presentation',12,true);text(comments.summary,11,false);
      for(const [heading,items] of [['What worked',comments.strengths],['What to improve',comments.improvements],['Try next',comments.recommendations]]){need(16);text(heading,11,true);items.forEach(item=>text('- '+item,10,false))}
      text('AI comments use the transcript and extracted slide text, which may be incomplete. Measured scores are calculated separately.',9,false,[72,101,127]);}
    y+=4;text(x.analysis?'This report uses recorded-audio transcription and code-based measurements. Transcription may miss fillers or misestimate pauses. It is practice feedback, not a judgment of overall speaking ability.':x.assess?'This pre-evaluation uses browser speech recognition. Its measurements are estimates.':'This legacy report has unverified measurement provenance.',9,false,[72,101,127],0);
    doc.setFontSize(8);doc.text('Generated by PresentTrack on '+new Date().toLocaleDateString('en',{year:'numeric',month:'long',day:'numeric'}),M,290);
    const name='PresentTrack-Report-'+pdfTxt(x.deck).replace(/[^\w]+/g,'-').replace(/^-|-$/g,'').slice(0,40)+'-'+String(x.d||'').replace(/[^\w]+/g,'-')+'.pdf';
    doc.save(name);toast('Report downloaded');
  }catch(e){toast('Could not create the PDF. Check your connection and try again.')}
  done();
}
const today=()=>new Date().toLocaleDateString('en',{month:'long',day:'numeric'});
function notify(i,t,s){S.notes.unshift({ic:i,t,s,r:0});renderTop();nav()}
function flash(msg,kind,robotMsg){S.flash=msg;robot('success',robotMsg||'Nice work! Your results are ready.',5000)}

/* ---------- shell: sidebar, top bar ---------- */
function nav(){
  const act=PARENT[S.view]||S.view,none=!S.pres.length&&!S.ses.length,hl=T.on&&T.steps[T.i]?T.steps[T.i].nav:null;
  $('nav').innerHTML=NAV.map(([g,items])=>`<p class="ng">${g}</p>`+items.map(([k,l])=>{const dis=false;return `<button class="nv${act===k?' on':''}${hl===k?' tour-hl':''}" data-go="${k}" type="button"${act===k?' aria-current="page"':''}${dis?' disabled title="Complete a practice session first"':''}>${ic(I[k])}<span>${l}</span>${k==='note'&&unread()?`<em>${unread()}</em>`:''}</button>`}).join('')).join('');
  $('help').innerHTML=ic(I.help)+'Help & Support';$('lo').innerHTML=ic(I.out)+'Logout';syncGuide();
}
function renderTop(){
  $('top').classList.toggle('skl',S.loading);
  $('av').src=pic();$('tav').src=pic();$('mn').textContent=S.u.name;$('mm').textContent=S.u.email;$('tn').textContent=S.u.name;
  const u=unread(),bn=$('bn');bn.hidden=!u;bn.textContent=u;bn.classList.toggle('w',S.notes.some(n=>!n.r&&n.warn));
  $('np').innerHTML=`<h4>Notifications</h4>`+(S.notes.length?S.notes.slice(0,4).map(x=>`<div class="nt ${x.r?'rd':''}"><span class="ne">${x.ic}</span><div><b>${esc(x.t)}</b><small>${esc(x.s)}</small></div></div>`).join(''):`<p class="em">You're all caught up.</p>`)+`<button class="bt gh sm" data-go="note" type="button">VIEW ALL NOTIFICATIONS</button>`;
}
const renderShell=()=>{nav();renderTop()};
function go(v,arg){
  window.PTVoice?.active&&PTVoice.stop();
  try{podium.practiceCleanup?.();podium.practiceCleanup=null;podium.leave&&podium.leave()}catch(e){}
  clearInterval(tm);S.view=v;S.arg=arg;
  if(v==='dash'&&!S.booted&&!S.loading){S.loading=true;S.booted=true;setTimeout(()=>{S.loading=false;if(S.view==='dash'){render()}renderTop();greetRobot()},1000);robot('thinking','Getting your dashboard ready…',1000)}
  render();closePops();$('side').classList.remove('open');$('mainc').scrollTop=0;
}
function render(){S.pres.forEach(p=>{if(p.scheduledDate)p.left=PTWorkspaceModel.preparation(p,S.ses).days});nav();renderTop();$('view').innerHTML=(V[S.view]||V.dash)(S.arg);B[S.view]&&B[S.view](S.arg);animateIn()}
function greetRobot(){
  rts.forEach(clearTimeout);rts=[];
  {const fn=S.u.name.split(' ')[0];if(S.isNew&&!S.toured){robot('greeting','Welcome! Tap my tour bubble whenever you would like a walkthrough.',5200)}else robot('greeting',empty()?'Hello '+fn+'! I\'ll help you get everything ready!':'Hello '+fn+'! Welcome back. Let\'s get some practice in.',5200)}
  if(!empty()){rts.push(setTimeout(()=>robot('reminder','Have a few minutes? Rehearse one part of your presentation.',5200),9000));rts.push(setTimeout(()=>robot('encouraging','Your next presentation is coming up. You still have time to practice!',5200),24000))}
}
function animateIn(){
  const root=$('view');
  $$('#view .dp2').forEach(c=>{const p=+c.dataset.p;if(rm)c.style.strokeDashoffset=326.7*(1-p/100);else requestAnimationFrame(()=>requestAnimationFrame(()=>c.style.strokeDashoffset=326.7*(1-p/100)))});
  $$('#view [data-n]').forEach(e=>{const t=parseFloat(e.dataset.n),s=e.dataset.s||'';if(rm||isNaN(t))return;const t0=performance.now();(function f(n){const k=Math.min(1,(n-t0)/800);e.textContent=Math.round(t*(1-Math.pow(1-k,3)))+s;if(k<1)requestAnimationFrame(f)})(t0)});
}
function closePops(){['np','pmn','qr'].forEach(i=>$(i).hidden=true)}
function setMin(m){podium.min=m;const b=$('bot');document.documentElement.classList.toggle('rmin',m);const inApp=!$('app').hidden;b.hidden=m||!inApp;$('bmini').hidden=!(m&&inApp);const bt=$('rbtn');if(bt)bt.textContent=m?'Show robot':'Minimize robot'}
podium.setMin=setMin;

/* ---------- events ---------- */
$('app').addEventListener('click',e=>{
  const t=e.target.closest('[data-go],[data-act]');
  if(!e.target.closest('.rel,.srch'))closePops();
  if(!t)return;
  if(t.dataset.go){go(t.dataset.go,t.dataset.a);return}
  const a=t.dataset.act,x=t.dataset.a;
  if(a==='flashx'){S.flash=null;render()}
  else if(a==='warnx'){S.warnOff=true;render()}
  else if(a==='metric'){S.metric=x;$('cwrap').outerHTML=chartBox(x);animateIn()}
  else if(a==='markall'){S.notes.forEach(n=>n.r=1);render()}
  else if(a==='tn'){const n=S.notes[+x];n.r=n.r?0:1;render()}
  else if(a==='pdf')downloadPdf(x);
  else if(a==='del')delPres(x);
  else if(a==='ren'){S.ren=+x;render()}
  else if(a==='rcancel'){S.ren=null;render()}
  else if(a==='rsave'){const t=$('rtitle').value.trim(),p=S.pres.find(q=>q.id==x);if(t.length<2){toast('Type a title first');return}if(p){S.ses.forEach(q=>{if(q.deck===p.short)q.deck=t});p.t=p.short=t}S.ren=null;render();toast('Title updated')}
  else if(a==='tprev')tourGo(-1);else if(a==='tnext')tourGo(1);else if(a==='tplay')tourPlay(!T.play);else if(a==='tskip')endTour(true);
  else if(a==='tadd'){endTour(false);go('decks');setTimeout(()=>{const u=$('ut');if(u)u.focus()},400)}
  else if(a==='tour'){startTour()}
  else if(a==='robotmin')setMin(!podium.min);
  else if(a==='state'&&window.PT_DEMO_CONTROLS===true&&!(window.PTCloud&&PTCloud.enabled)){
    if(x==='empty'){initData('empty');go('dash');toast('Switched to a new-user dashboard')}
    else if(x==='default'){initData('default');S.booted=true;go('dash');greetRobot();toast('Sample data restored')}
    else if(x==='loading'){S.loading=true;go('dash');robot('thinking','Getting your dashboard ready…',2400);setTimeout(()=>{S.loading=false;if(S.view==='dash')render();renderTop()},2400)}
    else if(x==='success'){flash('Practice session completed successfully!','success','Nice work! Your results are ready.');go('dash')}
    else if(x==='warning'){S.warnOff=false;S.flash=null;go('dash');robot('reminder','Your presentation is getting closer. Let\'s practice!',5200)}
  }
  else if(a==='rstate'&&window.PT_DEMO_CONTROLS===true&&!(window.PTCloud&&PTCloud.enabled)){const m={idle:['idle',''],greeting:['greeting','Hello '+S.u.name.split(' ')[0]+'! Welcome back. Let\'s get some practice in.'],encouraging:['encouraging','Your next presentation is coming up. You still have time to practice!'],reminder:['reminder','Your presentation is in 3 days. How about another practice session?'],success:['success','Nice work! Your speaking pace improved by 13%.'],thinking:['thinking','Thinking…']}[x];robot(m[0],m[1],5200)}
});
$('bell').onclick=e=>{e.stopPropagation();const o=$('np').hidden;closePops();$('np').hidden=!o};
$('pb').onclick=e=>{e.stopPropagation();const o=$('pmn').hidden;closePops();$('pmn').hidden=!o};
$('pmn').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;closePops();if(b.dataset.mp==='out')$('lo').click();else go('set')});
$('q').oninput=()=>{const q=$('q').value.trim().toLowerCase();if(!q){$('qr').hidden=true;return}
  const r=[...S.pres.filter(p=>p.t.toLowerCase().includes(q)).map(p=>['📊',p.t,'Presentation','pdet',p.id]),...S.ses.filter(x=>(x.deck+' '+x.d).toLowerCase().includes(q)).map(x=>['📄',x.deck+' · '+x.d,'Report','rdet',x.id])].slice(0,6);
  $('qr').hidden=false;$('qr').innerHTML=r.length?r.map(x=>`<button type="button" data-go="${x[3]}" data-a="${x[4]}"><span>${x[0]}</span><b>${esc(x[1])}</b><small>${x[2]}</small></button>`).join(''):'<p class="em">No results found.</p>'};
$('q').addEventListener('keydown',e=>{if(e.key==='Escape'){$('q').value='';closePops()}});
addEventListener('keydown',e=>{if(e.key==='Escape')closePops()});
$('qr').addEventListener('click',()=>{$('q').value=''});
$('pic').onchange=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{S.u.pic=r.result;renderShell();if($('sp'))$('sp').src=r.result;toast('Picture updated')};r.readAsDataURL(f)};
$('me').onclick=()=>go('set');$('menu').onclick=()=>$('side').classList.toggle('open');
$('help').onclick=()=>$('hm').hidden=false;$('hx').onclick=()=>$('hm').hidden=true;$('hrt').onclick=()=>{$('hm').hidden=true;startTour()};$('hm').onclick=e=>{if(e.target===$('hm'))$('hm').hidden=true};
$('bot').addEventListener('click',e=>{const b=e.target.closest('[data-tact]');if(b)tourAct(b.dataset.tact)});

$('bguide').onclick=()=>startTour();
$('bmin').onclick=()=>setMin(true);$('bmini').onclick=()=>setMin(false);
const ctr=e=>{if(!e)return[innerWidth/2,innerHeight/2];const r=e.getBoundingClientRect();return[r.left+r.width/2,r.top+r.height/2]};
function transition(p,swap){
  const w=$('wipe'),[x,y]=p;
  if(matchMedia('(prefers-reduced-motion:reduce)').matches){try{swap()}catch(e){console.error(e)}return}
  const r=Math.hypot(Math.max(x,innerWidth-x),Math.max(y,innerHeight-y));
  w.hidden=false;
  const a=w.animate({clipPath:['circle(0px at '+x+'px '+y+'px)','circle('+r+'px at '+x+'px '+y+'px)']},{duration:650,easing:'cubic-bezier(.65,0,.35,1)',fill:'forwards'});
  let done=false;const run=()=>{if(done)return;done=true;try{swap()}catch(e){console.error(e)}};
  setTimeout(()=>{run();w.getAnimations().forEach(q=>q.cancel());w.hidden=true},4500);   // backup: always swap, always clear the overlay
  a.onfinish=()=>{run();setTimeout(()=>{const b=w.animate({opacity:[1,0]},{duration:500,easing:'ease',fill:'forwards'});b.onfinish=()=>{w.getAnimations().forEach(q=>q.cancel());w.hidden=true}},280)};
}
const shell=()=>document.querySelector('.shell'),land=()=>$('land');
function showLand(){podium.welcomeStop?.();clearTimeout(window.__auto);document.documentElement.classList.remove('clay');$('app').hidden=true;shell().hidden=true;renderLand();land().hidden=false;try{podium.robotShow&&podium.robotShow(true,'welcome')}catch(e){console.warn(e)}land().classList.remove('in');void land().offsetWidth;land().classList.add('in');scrollTo(0,0);
  podium.welcomeStart?.()}
function toApp(v,p){clearTimeout(window.__auto);podium.welcomeStop?.();transition(p,()=>{land().hidden=true;$('app').hidden=false;document.documentElement.classList.add('clay');go(v);try{podium.robotShow&&podium.robotShow(true,'app');podium.setMin&&podium.setMin(innerWidth<900)}catch(e){console.warn(e)}})}
function signOut(p){podium.practiceCleanup?.();podium.practiceCleanup=null;clearTimeout(window.__auto);podium.welcomeStop?.();clearInterval(tm);transition(p,()=>{try{podium.save&&podium.save();window.PTCloud&&PTCloud.enabled&&PTCloud.signOut();podium.tourStop&&podium.tourStop()}catch(e){}try{podium.robotShow&&podium.robotShow(false)}catch(e){}document.documentElement.classList.remove('clay');$('app').hidden=true;land().hidden=true;shell().hidden=false;lf.reset();rf.reset();setTab('login');S.u.pic=''})}
function renderLand(){
  const a=avg(S.ses.map(x=>x.score)),f=S.u.name.split(' ')[0],ico=p=>'<span style="color:var(--brand);display:flex">'+ic(p)+'</span>';
  const cards=[['Timer with a target','M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z','Pick 3, 5 or 10 minutes and watch the ring fill as you speak.'],['Pace and filler words','M3 17l6-6 4 4 8-8M15 7h6v6','See your speed live and tap each filler word you catch.'],['Score and next steps','M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h7','Every session ends with a score and three clear tips.']];
  land().innerHTML=`<div class="lt" data-r style="--i:0"><div class="logo"><i></i>PresentTrack</div><span class="sp"></span><img src="${pic()}" alt="" width="36" height="36"><b>${S.u.name}</b><button class="bt gh" id="llo" type="button">Log out</button></div>
  <div class="lh welcome-hero"><p class="k">Welcome, ${esc(f)}</p><h1>Meet your presentation coach.</h1>
  <div class="welcome-stage" id="welcome-stage" aria-label="Tracy, your presentation coach"><div class="welcome-orbit" aria-hidden="true"></div></div>
  <p class="welcome-intro" id="welcome-intro" role="status" aria-live="polite">Tracy is getting ready to say hello…</p>
  <div class="welcome-actions"><button class="bt big" id="leval" type="button" hidden>Start evaluation</button><button class="welcome-skip" id="welcome-skip" type="button">Skip introduction</button><button class="welcome-skip" id="welcome-replay" type="button" hidden>Hear introduction again</button></div></div>
  <footer class="lfoot"><span>PresentTrack · Practice out loud, present with confidence</span><span>© 2026 PresentTrack</span></footer><div class="lf">${cards.map((c,i)=>`<div class="pn" data-r style="--i:${6+i}"><h3>${ico(c[1])}${c[0]}</h3><p>${c[2]}</p></div>`).join('')}</div>`;
  $('leval').onclick=e=>toApp('eval',ctr(e.currentTarget));$('llo').onclick=e=>signOut(ctr(e.currentTarget));
}
podium.enter=(name,email)=>{S.u.name=name.replace(/[._-]+/g,' ').replace(/\b\w/g,c=>c.toUpperCase());S.u.email=email;podium.name=S.u.name.split(' ')[0];podium.account(email,!!podium.newUser);try{podium.assessInit&&podium.assessInit()}catch(e){console.warn(e)}
  podium.welcomePrepare?.();
  transition(ctr(document.querySelector('#authView form:not([hidden]) .btn')),showLand)};
$('lo').onclick=e=>signOut(ctr(e.currentTarget));
const hm=document.querySelector('.sl');hm.tabIndex=0;hm.setAttribute('role','button');hm.title='Back to welcome page';hm.style.cursor='pointer';
hm.onclick=()=>transition(ctr(hm),showLand);hm.onkeydown=e=>{if(e.key==='Enter')hm.click()};
podium.ext={PARENT,pendingEval,S,V,B,go,render,toast,esc,page,sec,nodata,fmt,ring,flash,robot,notify,FILES,today,nav,renderTop,confirmDlg,gated,find,ic,I};
})();
