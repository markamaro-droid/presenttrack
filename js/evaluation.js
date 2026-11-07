/* Start Evaluation (new accounts only).
   The user talks for 2-3 minutes. The browser's speech recognition gives the words and when they were said;
   the shared, tested modules in supabase/functions/_shared turn that into WPM, filler words, long pauses,
   a recognition-quality check and a baseline classification. No audio is recorded or uploaded.
   The result is saved with the account (user_data.data.ev), so it is persistent and never asked twice. */
(()=>{
const X=podium.ext;if(!X)return;
const {S,V,B,go,toast,esc,page,sec,nodata,fmt,flash,robot,notify,today,PARENT,pendingEval}=X;
const $=id=>document.getElementById(id);
const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
const mm=s=>fmt(Math.max(0,s||0));
const MIN=20,MAX=300;
PARENT.evres='eval';PARENT.base='perf';
const DECK=window.PT_EVALUATION_DECK;
const E={st:'idle',slide:0,segs:{},ses:0,want:false,rec:null,iv:0,t0:0,total:0,fatal:null,retake:false};

/* shared analysis code (same files the Supabase functions use) */
let CORE=null,CV=null;   /* CV = the loaded modules, once available (lets the dashboard card render without waiting) */
const core=()=>CORE||(CORE=Promise.all([import('../supabase/functions/_shared/metrics.js'),import('../supabase/functions/_shared/quality.js'),import('../supabase/functions/_shared/classify.js'),import('../supabase/functions/_shared/feedback.js'),import('../supabase/functions/_shared/criteria.js'),import('../supabase/functions/_shared/baseline.js')])
  .then(([m,q,c,f,k,b])=>(CV={computeMetrics:m.computeMetrics,assessQuality:q.assessQuality,classify:c.classify,ruleBasedFeedback:f.ruleBasedFeedback,CRITERIA:k.CRITERIA,baselineFromSessions:b.baselineFromSessions}))
  .catch(e=>{CORE=null;throw e}));

/* ---------- evaluation page ---------- */
V.eval=()=>{
  if(S.ev&&S.ev.done&&!E.retake)return V.evres();
  return page('Evaluation','',`<section class="pn evaluation-viewer" id="evalviewer">
    <div class="evaluation-toolbar">
      <span id="eslide-count" role="status"></span>
      <div id="erec"></div>
      <div class="vbt" role="group" aria-label="Slide controls">
        <button class="bt gh sm" id="eprev" type="button" aria-label="Previous slide">Previous</button>
        <button class="bt gh sm" id="enext" type="button" aria-label="Next slide">Next</button>
        <button class="bt gh sm" id="efs" type="button">Full screen</button>
      </div>
    </div>
    <div id="eslide" class="vst" aria-live="polite"></div>
  </section>`);
};
B.eval=()=>{
  if(S.ev?.done&&!E.retake){loadReportCriteria();return}
  draw();showSlide();
  if($('efs'))$('efs').onclick=()=>setFullscreen(!isFullscreen());
  if($('eprev'))$('eprev').onclick=()=>{E.slide--;showSlide()};
  if($('enext'))$('enext').onclick=()=>{E.slide++;showSlide()};
};
function showSlide(){
  const host=$('eslide');if(!host)return;
  E.slide=Math.max(0,Math.min(E.slide,DECK.slides.length-1));
  const slide=DECK.slides[E.slide];
  host.innerHTML=`<div class="sld${DECK.narrative?' evaluation-script':E.slide===0?' stitle':''}"><h4>${esc(slide.title)}</h4>${DECK.narrative?slide.bullets.map(t=>`<p>${esc(t)}</p>`).join(''):`<ul>${slide.bullets.map(t=>`<li>${esc(t)}</li>`).join('')}</ul>`}</div>`;
  $('eslide-count').textContent='Slide '+(E.slide+1)+' / '+DECK.slides.length;
  $('eprev').disabled=E.slide===0;$('enext').disabled=E.slide===DECK.slides.length-1;
}
document.addEventListener('keydown',e=>{
  if(S.view!=='eval'||!$('eslide')||e.ctrlKey||e.metaKey||e.altKey||/^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(e.target.tagName))return;
  if(e.key==='ArrowRight'||e.key==='ArrowLeft'){E.slide+=e.key==='ArrowRight'?1:-1;showSlide();e.preventDefault()}
});
function setE(o){Object.assign(E,o);draw()}
function draw(){
  const h=$('erec');if(!h)return;
  const elapsed=E.st==='rec'?(performance.now()-E.t0)/1000:E.st==='busy'||E.save?E.total:0;
  let controls='';
  if(E.st==='idle')controls='<button class="bt sm" data-act="estart" type="button">Start</button><button class="bt gh sm" type="button" disabled>Finish</button>';
  else if(E.st==='ask')controls='<span role="status">Waiting for microphone permission...</span>';
  else if(E.st==='rec')controls='<button class="bt sm" data-act="efin" type="button">Finish</button><button class="bt gh sm" data-act="ecancel" type="button">Cancel</button>';
  else if(E.st==='busy')controls='<span role="status">Analyzing your speech...</span>';
  else if(E.st==='err')controls=`${E.save?'<button class="bt sm" data-act="esave" type="button">Retry saving</button>':''}<button class="bt gh sm" data-act="estart" type="button">Try again</button>`;
  h.innerHTML=`<div class="evaluation-record"><div class="vtm" aria-label="Elapsed time"><b id="etm">${mm(elapsed)}</b><small>${E.st==='rec'?'Listening':'Target 2-3 min'}</small></div>${controls}</div>
    <p class="vnote" id="enote" role="status"></p>${E.st==='err'?`<p class="wr" role="alert">${esc(E.msg||'Something went wrong.')}</p>`:''}`;
}
const fullscreenElement=()=>document.fullscreenElement||document.webkitFullscreenElement;
const isFullscreen=()=>!!$('evalviewer')&&($('evalviewer')===fullscreenElement()||$('evalviewer').classList.contains('evaluation-fullscreen'));
function syncFullscreen(){
  const viewer=$('evalviewer');if(!viewer)return;
  const full=isFullscreen();viewer.classList.toggle('evaluation-expanded',full);
  $('efs').textContent=full?'Exit full screen':'Full screen';
}
function setFullscreen(on){
  const viewer=$('evalviewer');if(!viewer)return;
  const fallback=()=>{if(!viewer.isConnected)return;viewer.classList.add('evaluation-fullscreen');document.body.classList.add('evaluation-fullscreen-open');syncFullscreen()};
  if(on){
    const request=viewer.requestFullscreen||viewer.webkitRequestFullscreen;
    if(!request)return fallback();
    try{const p=request.call(viewer);if(p&&p.catch)p.catch(fallback)}catch(e){fallback()}
  }else{
    viewer.classList.remove('evaluation-fullscreen','evaluation-expanded');document.body.classList.remove('evaluation-fullscreen-open');
    if(fullscreenElement()===viewer){try{const p=(document.exitFullscreen||document.webkitExitFullscreen).call(document);p?.catch?.(()=>{})}catch(e){}}
    syncFullscreen();
  }
}
document.addEventListener('fullscreenchange',syncFullscreen);
document.addEventListener('webkitfullscreenchange',syncFullscreen);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('evalviewer')?.classList.contains('evaluation-fullscreen'))setFullscreen(false)});

const note=m=>{const n=$('enote');if(n)n.textContent=m};

/* ---------- listening ---------- */
async function start(){
  if(E.st==='ask'||E.st==='rec'||E.st==='busy')return;
  window.PTVoice?.active&&PTVoice.stop();
  if(!SR||!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia)return setE({st:'err',msg:'This browser cannot do speech recognition. Please open PresentTrack in Google Chrome or Microsoft Edge on a computer or Android phone.',warn:[]});
  setE({st:'ask'});
  try{const s=await navigator.mediaDevices.getUserMedia({audio:true});s.getTracks().forEach(t=>t.stop())}
  catch(e){return setE({st:'err',msg:e&&e.name==='NotFoundError'?'No microphone was found. Connect one and try again.':'Microphone access was blocked. Allow it for this site in your browser settings, then try again.',warn:[]})}
  if(!$('erec'))return;
  E.segs={};E.ses=0;E.fatal=null;E.save=false;E.pend=null;E.want=true;E.t0=performance.now();clearInterval(E.iv);E.iv=setInterval(tick,250);
  setE({st:'rec'});begin();
}
function begin(){
  let r;try{r=new SR()}catch(e){return abort('Speech recognition could not start in this browser.')}
  E.rec=r;const ses=++E.ses;r.lang='en-US';r.continuous=true;r.interimResults=true;r.maxAlternatives=1;
  r.onresult=ev=>{const now=(performance.now()-E.t0)/1000;
    for(let i=ev.resultIndex;i<ev.results.length;i++){const res=ev.results[i],alt=res&&res[0],txt=((alt&&alt.transcript)||'').trim();if(!txt)continue;
      const k=ses+':'+i;let g=E.segs[k];if(!g)g=E.segs[k]={start:now,last:now,text:'',conf:null};
      if(txt!==g.text){g.text=txt;g.last=now}
      if(res.isFinal&&alt.confidence>0)g.conf=alt.confidence}};
  r.onerror=ev=>{const c=ev&&ev.error;if(c==='no-speech'||c==='aborted')return;
    E.fatal=c==='not-allowed'||c==='service-not-allowed'?'Microphone or speech recognition is blocked. Allow the microphone for this site, then try again.'
      :c==='audio-capture'?'No microphone was found. Connect one and try again.'
      :c==='network'?'Speech recognition needs an internet connection. Check your connection and try again.':'Speech recognition stopped unexpectedly. Please try again.'};
  r.onend=()=>{if(!E.want||E.rec!==r)return;if(E.fatal)return abort(E.fatal);setTimeout(()=>{if(E.want&&E.rec===r){try{begin()}catch(e){abort('Speech recognition stopped unexpectedly. Please try again.')}}},150)};
  try{r.start()}catch(e){abort('Speech recognition could not start. Please try again.')}
}
function liveText(){const a=Object.values(E.segs).sort((x,y)=>x.start-y.start).map(g=>g.text).join(' ');return a.length>170?'…'+a.slice(-170):a}
function tick(){const t=$('etm');if(!t){if(E.st==='rec'){halt();E.st='idle'}return}const e=(performance.now()-E.t0)/1000;t.textContent=mm(e);
  const l=$('elive');if(l&&Object.keys(E.segs).length)l.textContent=liveText();if(e>=MAX)finish(true)}
function halt(){E.want=false;clearInterval(E.iv);const r=E.rec;E.rec=null;if(r){r.onresult=r.onend=r.onerror=null;try{r.abort()}catch(e){}}}
function abort(msg){halt();setE({st:'err',msg,warn:[]})}
podium.leave=(p=>()=>{setFullscreen(false);try{p&&p()}catch(e){}if(E.st==='rec'||E.st==='ask'){halt();E.st='idle'}})(podium.leave);

async function finish(auto){
  if(E.st!=='rec')return;
  const el=(performance.now()-E.t0)/1000;
  if(el<MIN&&!auto){note('Please talk for at least '+MIN+' seconds so there is enough to measure.');return}
  E.total=el;E.want=false;clearInterval(E.iv);setE({st:'busy'});robot('thinking','Analyzing your speech…',5000);
  await new Promise(res=>{const r=E.rec;let d=false;const f=()=>{if(!d){d=true;res()}};if(!r)return f();r.onend=f;r.onerror=null;try{r.stop()}catch(e){f()}setTimeout(f,1800)});
  E.rec=null;await analyze();
}
async function analyze(){
  let C;try{C=await core()}catch(e){return setE({st:'err',msg:'The analysis code could not be loaded. Open the site from its web address (not as a file) and try again.',warn:[]})}
  const segs=Object.values(E.segs).filter(g=>g.text).sort((a,b)=>a.start-b.start),words=[],qs=[];
  segs.forEach(g=>{const t=g.text.split(/\s+/).filter(Boolean),n=t.length;if(!n)return;
    const span=Math.max(g.last-g.start,n*.35),per=span/n;
    t.forEach((w,k)=>words.push({word:w,start:g.start+k*per,end:g.start+k*per+per*.85}));
    qs.push({avg_logprob:g.conf>0?Math.log(g.conf):NaN,no_speech_prob:0})});
  const metrics=C.computeMetrics({words,totalDurationSec:E.total}),quality=C.assessQuality(metrics,qs);
  if(quality.level==='unusable')return setE({st:'err',msg:'We could not hear enough speech to give meaningful results. Please try again in a quiet place, closer to your microphone, and talk for 2 to 3 minutes.',warn:quality.warnings||[]});
  // Browser recognition provides phrase events, not reliable word timestamps.
  metrics.wpm=metrics.overallWpm;metrics.paceBasis='recognized-words-over-elapsed-time';
  const result=C.classify(metrics,quality,C.CRITERIA),feedback=C.ruleBasedFeedback(metrics,result);
  const results={version:2,criteriaVersion:C.CRITERIA.version,criteria:C.CRITERIA,source:'browser-speech-recognition',topic:DECK.title,deckId:DECK.id,deckVersion:DECK.version,quality,metrics,durationAssessment:result.durationAssessment,dims:result.dims,totalPoints:result.totalPoints,maxPoints:result.maxPoints,score:result.score,classification:result.classification,explanation:result.explanation,feedback,transcript:segs.map(g=>g.text).join(' ').slice(0,6000),created_at:new Date().toISOString()};
  return commit(results);
}
/* Cloud accounts: the SERVER must accept the result first (it sets the flag that unlocks uploads).
   If that fails nothing is unlocked and the user can retry saving without recording again. */
async function commit(results){
  const cloud=window.PTCloud&&PTCloud.enabled;
  if(cloud){
    setE({st:'busy'});
    const c=await PTCloud.completeEvaluation(results);
    if(c.error){E.pend=c.invalid?null:results;return setE({st:'err',msg:c.error,warn:[],save:!c.invalid&&c.retryable!==false})}
  }
  E.pend=null;E.save=false;
  const metrics=results.metrics||{};
  S.ev={done:true,at:results.created_at,results};S.evalRequired=false;S.assessRequired=false;
  const x={id:S.nid++,deck:'Initial Evaluation',d:today(),at:results.created_at||new Date().toISOString(),dur:Math.round(metrics.totalDurationSec||0),wpm:Math.round(metrics.wpm||0),fill:metrics.fillerCount||0,pau:metrics.pauseCount||0,score:results.score,tg:150,assess:true};
  const i=S.ses.findIndex(q=>q.assess);if(i>=0)S.ses.splice(i,1);S.ses.push(x);
  E.retake=false;E.st='idle';
  let saved=true;
  if(window.PTCloud&&PTCloud.enabled){const r=await PTCloud.saveNow(podium.snapshot());if(r.error)saved=false}else podium.save&&podium.save();
  notify('✅','Evaluation completed','Your baseline is ready. You can upload your presentations now.');
  flash('Evaluation completed!','success','Great job! Your baseline is ready.');
  if(!saved)toast('Your result is shown, but saving failed. It will retry automatically.');
  go('evres');
}

/* ---------- results ---------- */
const CLASS={proficient:['Proficient','ok'],developing:['Developing','warn'],needs_improvement:['Needs Improvement','warn']};
function timeline(m){
  const W=600,tot=Math.max(1,m.totalDurationSec||1),x=t=>8+Math.min(1,t/tot)*(W-16);
  const pa=(m.pauses||[]).map(p=>`<rect x="${x(p.t)}" y="22" width="${Math.max(3,x(p.t+p.dur)-x(p.t))}" height="26" rx="3" fill="color-mix(in srgb,var(--err) 55%,transparent)" style="filter:none"><title>Pause ${mm(p.t)} · ${p.dur}s</title></rect>`).join('');
  const fi=(m.fillers||[]).map(f=>`<rect x="${x(f.t)-1.5}" y="14" width="3" height="42" rx="1.5" fill="#E8930C" style="filter:none"><title>${esc(f.word)} at ${mm(f.t)}</title></rect>`).join('');
  return `<svg class="cht" viewBox="0 0 ${W} 86" role="img" aria-label="Timeline of your talk with ${m.fillerCount} filler words and ${m.pauseCount} long pauses"><rect x="8" y="22" width="${W-16}" height="26" rx="8" fill="var(--cs)" style="filter:none" stroke="var(--ish)"/>${pa}${fi}<text x="8" y="72">0:00</text><text x="${W-8}" y="72" text-anchor="end">${mm(tot)}</text><text x="${W/2}" y="72" text-anchor="middle">Talk timeline</text></svg><p class="basis" style="margin:6px 0 0"><span class="lg amber"></span> filler word &nbsp; <span class="lg red"></span> long pause</p>`}
const reportIcon=name=>{
  const paths={pace:'M4 16a8 8 0 1 1 16 0M12 13l4-5M4 20h16',words:'M4 4h16v13H8l-4 3zM8 8h8M8 12h5',time:'M12 8v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',fill:'M5 5h5v6H7v4H4V9zM15 5h5v6h-3v4h-3V9z',pause:'M8 5v14M16 5v14',check:'M5 12l4 4L19 6',target:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',arrow:'M5 12h14M13 6l6 6-6 6'};
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]||paths.target}"/></svg>`;
};
let reportLoading=false;
function loadReportCriteria(){
  if(CV||reportLoading)return;
  reportLoading=true;core().then(()=>{reportLoading=false;if(['eval','evres','base'].includes(S.view))X.render()}).catch(()=>{reportLoading=false;toast('Updated scoring could not load. Please reload to refresh this report.')});
}
B.evres=loadReportCriteria;
V.evres=()=>{
  const saved=S.ev&&S.ev.results;
  let r=saved;
  if(saved&&CV&&saved.source==='browser-speech-recognition'){
    const metrics={...saved.metrics};
    if(metrics.totalDurationSec>0&&Number.isFinite(metrics.words))metrics.wpm=Math.round(metrics.words*600/metrics.totalDurationSec)/10;
    const updated=CV.classify(metrics,saved.quality,CV.CRITERIA);
    r={...saved,...updated,metrics,criteria:CV.CRITERIA,feedback:CV.ruleBasedFeedback(metrics,updated)};
  }
  if(!r)return page('Evaluation results','',sec('RESULTS',1,nodata('You have not taken the evaluation yet.','<button class="bt" data-go="eval" type="button">START EVALUATION</button>')));
  const m=r.metrics||{},q=r.quality||{},d=r.durationAssessment||{},f=r.feedback||{},cl=CLASS[r.classification]||['Result',''];
  const num=v=>Number.isFinite(Number(v))?Math.max(0,Number(v)):0;
  const score=Math.min(100,Math.round(num(r.score))),wpm=Math.round(num(m.wpm)),duration=num(m.totalDurationSec);
  const pace=r.criteria?.pace||CV?.CRITERIA.pace||{idealMin:100,idealMax:160};
  const min=num(pace.idealMin),max=num(pace.idealMax),scale=Math.max(240,max+40,wpm+20);
  const targetMin=num(d.targetMinSec)||120,targetMax=num(d.targetMaxSec)||180;
  const list=a=>(a&&a.length)?`<ul>${a.map(t=>`<li>${esc(t)}</li>`).join('')}</ul>`:'<p class="sub">No additional observations.</p>';
  const metric=(icon,title,value,unit,note)=>`<article class="er-metric"><span class="er-icon">${reportIcon(icon)}</span><h3>${title}</h3><div class="er-value">${value}<small>${unit}</small></div><p>${esc(note)}</p></article>`;
  const dims=Object.entries(r.dims||{}).filter(([,v])=>v&&Number.isFinite(v.points));
  const dimNames={pace:'Speaking pace',fillers:'Filler control',pauses:'Pause control',duration:'Talk duration'};
  const date=r.created_at&&!Number.isNaN(Date.parse(r.created_at))?new Date(r.created_at).toLocaleDateString('en',{month:'short',day:'numeric',year:'numeric'}):'Baseline assessment';
  return page('Evaluation results','Your starting point. Your next step.',`<div class="evaluation-report">
    <section class="er-hero">
      <div class="er-score" role="img" aria-label="Baseline score ${score} out of 100"><svg viewBox="0 0 160 160" aria-hidden="true"><circle cx="80" cy="80" r="66" class="er-ring-track"/><circle cx="80" cy="80" r="66" class="er-ring-value" pathLength="100" stroke-dasharray="${score} 100"/></svg><div><strong>${score}<small>/100</small></strong><span>BASELINE SCORE</span></div></div>
      <div class="er-intro"><span class="er-eyebrow">YOUR SPEAKING SNAPSHOT</span><h2>A starting point for stronger presentations.</h2><div class="er-meta"><span class="st ${cl[1]}">${cl[0]}</span><span>${esc(date)}</span></div><p>This baseline measures pace, fillers, pauses and talk length. Use it to choose what to practice next.</p></div>
      <div class="er-focus"><span class="er-icon">${reportIcon('target')}</span><span class="er-eyebrow">YOUR NEXT FOCUS</span><p>${esc((f.recommendations||[])[0]||'Review your delivery below and choose one skill to practice.')}</p><a class="er-link" href="#evaluation-plan">See your practice plan ${reportIcon('arrow')}</a></div>
    </section>
    <div class="er-metrics">
      ${metric('pace','Estimated pace',wpm,'WPM',r.dims?.pace?.label||'Recognized speaking speed')}
      ${metric('words','Words spoken',num(m.words),'words','Recognized in this evaluation')}
      ${metric('time','Talk duration',mm(duration),'',`Target ${mm(targetMin)} to ${mm(targetMax)}`)}
      ${metric('fill','Filler words',num(m.fillerCount),'detected','Estimated by speech recognition')}
      ${metric('pause','Long pauses',num(m.pauseCount),'detected','Gaps of 2 seconds or longer')}
    </div>
    <div class="er-analysis">
      <section class="er-panel"><span class="er-eyebrow">DELIVERY INSIGHTS</span><h3>Find your speaking rhythm</h3><div class="er-chart-title"><b>${wpm} <small>WPM</small></b><span>Reference ${min}&ndash;${max} WPM</span></div>
        <div class="er-pace" role="img" aria-label="Pace ${wpm} WPM; target ${min} to ${max} WPM"><i style="left:${min/scale*100}%;width:${(max-min)/scale*100}%"></i><b style="left:${wpm/scale*100}%"></b></div>
        <div class="er-axis"><span>0</span><span>Words per minute</span><span>${Math.ceil(scale)}</span></div>
        <div class="er-duration"><div><strong>Presentation length</strong><span>${mm(duration)} / ${mm(targetMin)}&ndash;${mm(targetMax)} target</span></div><progress max="${Math.max(targetMax,duration,1)}" value="${duration}" aria-label="Presentation duration"></progress><p>${esc({too_short:'Give each main point a little more room.',within_range:'Your talk fits the target duration.',too_long:'Focus on your key points to fit the time.'}[d.status]||'Compare your talk length with the target.')}</p></div>
      </section>
      <section class="er-panel"><span class="er-eyebrow">SCORE BREAKDOWN</span><h3>What shaped your baseline</h3>${dims.length?dims.map(([key,v])=>`<div class="er-dimension"><div><span>${esc(dimNames[key]||key)}</span><b>${num(v.points)} / 2</b></div><progress max="2" value="${Math.min(2,num(v.points))}" aria-label="${esc(dimNames[key]||key)} score"></progress><small>${esc(v.label||'')}</small></div>`).join(''):'<p class="sub">A detailed score breakdown is not available for this saved evaluation.</p>'}</section>
    </div>
    <section class="er-panel er-timeline"><div class="er-section-head"><div><span class="er-eyebrow">MOMENTS IN YOUR TALK</span><h3>Your delivery timeline</h3></div><span class="er-tag">${mm(duration)} total</span></div>${timeline(m)}${!(m.fillers||[]).length&&!(m.pauses||[]).length?'<p class="er-empty">No filler or long-pause markers were detected in this evaluation.</p>':''}<p class="basis">Markers show estimated events, not an audio waveform.</p></section>
    <section id="evaluation-plan" class="er-plan"><span class="er-eyebrow">WHAT TO PRACTICE NEXT</span><h2>Turn feedback into your next rehearsal.</h2><div class="er-coaching"><article class="er-panel er-strength"><h3>${reportIcon('check')} Keep doing</h3>${list(f.strengths)}</article><article class="er-panel er-improve"><h3>${reportIcon('target')} Give attention to</h3>${list(f.improvements)}</article></div>
      <ol class="er-steps">${(f.recommendations||[]).map((t,i)=>`<li><span>${String(i+1).padStart(2,'0')}</span><p>${esc(t)}</p></li>`).join('')}</ol>
      <div class="er-actions"><button class="bt" data-go="up" type="button">Practice with your presentation ${reportIcon('arrow')}</button><button class="bt gh" data-go="hist" type="button">Practice history</button><button class="bt gh" data-act="eretake" type="button">Retake evaluation</button></div>
    </section>
    <details class="er-panel er-method" ${q.level==='low'?'open':''}><summary>${reportIcon('words')} Recognition quality &amp; how this was measured${q.level==='low'?' - Low-confidence recording':''}</summary><p>${esc(r.explanation||'This is a baseline, not a definitive judgment of your speaking ability.')}</p>${list(q.warnings)}<p>For browser evaluations, pace is recognized words divided by total elapsed minutes, including pauses. This avoids treating estimated word timings as exact speech measurements. Browser recognition can miss fillers and estimate timing incorrectly. Eye contact, confidence and body language are not evaluated.</p>${f.summary?`<p>${esc(f.summary)}</p>`:''}<p>The 100-160 WPM range is a presentation coaching reference, not a universal standard. Clarity depends on content and audience. Saved browser evaluations are re-scored for this view with the current rubric; the original stored report and history are unchanged.</p>${r.transcript?`<details><summary>Review recognized transcript</summary><p>${esc(r.transcript)}</p></details>`:''}</details>
  </div>`);
};

/* ---------- baseline for EXISTING accounts ----------
   Accounts that already have practice history skip the evaluation. Instead we analyze their saved sessions
   (shared module baseline.js, thresholds in criteria.js) and show the same kind of baseline. Nothing is stored:
   it is recomputed from S.ses whenever it is shown, so it stays current as they practice. */
const hasHist=()=>!!(S.ses&&S.ses.some(q=>!q.assess));
const legacy=()=>!S.evalRequired&&!(S.ev&&S.ev.done)&&hasHist();
const blKey=()=>S.ses.length+':'+S.ses.reduce((a,q)=>a+(+q.dur||0)+(+q.wpm||0),0);
function blNow(){   /* undefined = modules still loading, null = not enough usable sessions */
  if(!CV)return undefined;
  const k=blKey();if(E.blk!==k){E.bl=CV.baselineFromSessions(S.ses,CV.CRITERIA);E.blk=k}
  return E.bl;
}
function blLoad(){
  if(E.blLoading)return;E.blLoading=true;
  core().then(()=>{E.blLoading=false;if(!$('app').hidden&&(S.view==='dash'||S.view==='base')){const y=$('mainc').scrollTop;X.render();$('mainc').scrollTop=y}})
    .catch(()=>{E.blLoading=false;E.bl=null;E.blk=blKey()})
}
podium.baselineBanner=()=>{
  if(!legacy())return '';
  const b=blNow();if(b===undefined){blLoad();return ''}if(!b)return '';
  const cl=CLASS[b.classification]||['Result',''],m=b.metrics;
  return `<section class="pn rise cont" style="--i:0"><div><h3 class="sh">YOUR SPEAKING BASELINE · FROM YOUR PAST SESSIONS</h3><p class="sub" style="margin:0">We analyzed your last ${b.sessionsUsed} practice session${b.sessionsUsed===1?'':'s'}: about ${Math.round(m.wpm)} WPM, ${m.fillersPerMin} filler words and ${m.pausesPerMin} long pauses per minute. <b>${cl[0]}</b>.</p></div><button class="bt" data-go="base" type="button">VIEW BASELINE</button></section>`;
};
V.base=()=>{
  if(S.ev&&S.ev.done)return V.evres();
  const b=blNow();
  if(b===undefined){blLoad();return page('Your speaking baseline','',sec('LOADING',1,'<div class="alo" role="status"><i></i>Analyzing your past sessions…</div>'))}
  if(!b)return page('Your speaking baseline','',sec('NOT ENOUGH DATA',1,nodata('Your baseline is built from your saved practice sessions. Complete a practice session (30 seconds or longer) and it will appear here.','<button class="bt" data-go="prac" type="button">START PRACTICE</button>')));
  const m=b.metrics,cl=CLASS[b.classification]||['Result',''],n=b.sessionsUsed;
  const list=a=>(a&&a.length)?`<ul class="tp">${a.map(t=>`<li>${esc(t)}</li>`).join('')}</ul>`:'<p class="em">Nothing to show here.</p>';
  const card=(t,v,s)=>`<article class="mc"><h4>${t}</h4><p class="mv">${v}</p>${s?`<small>${s}</small>`:''}</article>`;
  const dimRow=(k,t)=>{const x=b.dims[k];return `<div class="gl2"><div class="gh2"><span>${t}</span><b>${esc(x.label)}</b></div><div class="bar2"><i style="width:${x.points/2*100}%"></i></div><p class="basis" style="margin:4px 0 0">${esc(x.detail||'')}</p></div>`};
  const tr=b.trend?`<p class="basis" style="margin:10px 0 0">Trend: ${b.trend.direction==='up'?'your newer sessions score about '+b.trend.change+' points higher than your older ones.':b.trend.direction==='down'?'your newer sessions score about '+Math.abs(b.trend.change)+' points lower than your older ones.':'your scores are steady across these sessions.'}</p>`:'';
  return page('Your speaking baseline','Built from your last '+n+' saved practice session'+(n===1?'':'s')+'.',
   sec('YOUR BASELINE',1,`<p class="sub" style="margin:0 0 8px"><span class="st ${cl[1]}">${cl[0]}</span> &nbsp; Score ${b.score}%</p><p class="sub" style="margin:0">This is a baseline from your practice history, not a final judgment of your ability. Eye contact, gestures and body language are not measured.</p>`)
   +`<div class="g-perf five">${card('Speaking speed',Math.round(m.wpm)+' <small>WPM</small>',esc(b.dims.pace.label))}${card('Filler words',m.fillersPerMin+' <small>/ min</small>',m.fillerCount+' in total')}${card('Long pauses',m.pausesPerMin+' <small>/ min</small>',m.pauseCount+' in total')}${card('Average session',mm(m.totalDurationSec),'')}${card('Sessions analyzed',n,'Average score '+b.avgSessionScore+'%')}</div>`
   +sec('HOW YOUR SCORE ADDS UP',2,dimRow('pace','Pace')+dimRow('fillers','Filler words')+dimRow('pauses','Pauses')+tr)
   +`<div class="g2">${sec('STRENGTHS',3,list(b.strengths))}${sec('AREAS TO IMPROVE',4,list(b.improvements))}</div>`
   +sec('HOW THIS WAS MEASURED',5,`<ul class="tp"><li>We use the numbers saved with each of your past sessions: speaking speed, filler words and long pauses. Your speed is weighted by how long each session was.</li><li>Filler words and pauses are shown per minute of practice so short and long sessions can be compared.</li><li>Session length is not scored, because each of your presentations had its own target time.</li><li>No audio is re-analyzed. Your baseline updates automatically as you practice.</li></ul><div class="acts"><button class="bt" data-go="prac" type="button">PRACTICE</button><button class="bt gh" data-go="rep" type="button">REPORTS</button></div>`));
};

$('app').addEventListener('click',e=>{
  const t=e.target.closest('[data-act]');if(!t)return;const a=t.dataset.act;
  if(a==='estart')start();
  else if(a==='esave'){if(E.pend)commit(E.pend)}
  else if(a==='efin')finish(false);
  else if(a==='ecancel'){halt();setE({st:'idle'})}
  else if(a==='eretake'){E.retake=true;E.st='idle';E.slide=0;go('eval')}
});
})();
