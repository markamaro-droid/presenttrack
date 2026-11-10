/* Evaluation records the displayed talk for server transcription and content validation.
   No baseline is committed until both the audio analysis and save succeed. */
(()=>{
const X=podium.ext;if(!X)return;
const {S,V,B,go,toast,esc,page,sec,nodata,fmt,flash,robot,notify,today,PARENT,pendingEval}=X;
const $=id=>document.getElementById(id);
const mm=s=>fmt(Math.max(0,s||0));
const MIN=90,MAX=300;
PARENT.evres='eval';PARENT.base='perf';
const DECK=window.PT_EVALUATION_DECK;
const E={st:'idle',slide:0,capture:null,controller:null,generation:0,iv:0,t0:0,total:0,retake:false};

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
    <label class="hint evaluation-consent"><input type="checkbox" id="econsent"> Record my microphone and send the audio to Groq for transcription and Gemini for a verbatim filler check. Save the transcript and validated baseline to my account. Present the slide ideas for 2-3 minutes; counting or unrelated speech will not earn a score. Audio is discarded after processing (large uploads use temporary private storage).</label>
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
  else if(E.st==='err')controls=`${E.save?'<button class="bt sm" data-act="esave" type="button">Retry saving</button>':E.blob?'<button class="bt sm" data-act="eanalyze" type="button">Retry analysis</button>':''}<button class="bt gh sm" data-act="estart" type="button">Try again</button>`;
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
  if(['ask','rec','busy'].includes(E.st))return;
  if(!$('econsent')?.checked)return note('Please consent to recording and audio processing before starting.');
  if(!window.PTCloud?.enabled||!window.PTCloud.user)return setE({st:'err',msg:'Sign in to analyze and save an evaluation.'});
  if(!window.PTPracticeAudio||!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder)return setE({st:'err',msg:'Audio recording is unavailable. Use a browser with microphone recording support on HTTPS or localhost.'});
  halt();E.blob=null;E.save=false;E.pend=null;E.total=0;
  const generation=E.generation,owner=window.PTCloud.user.id;
  E.owner=owner;E.capture=new window.PTPracticeAudio.Capture();
  window.podium?.hushNow?.();setE({st:'ask'});
  try{
    await E.capture.start();
    if(generation!==E.generation)return;
    if(window.PTCloud?.user?.id!==owner||S.view!=='eval'){halt();E.st='idle';return}
    E.t0=performance.now();setE({st:'rec'});E.iv=setInterval(tick,250);
  }catch(error){if(generation===E.generation){halt();setE({st:'err',msg:error.message||'Microphone permission was blocked. Please allow it and retry.'})}}
}
function tick(){
  if(E.st!=='rec')return;
  if(!$('etm')||S.view!=='eval'){halt();E.st='idle';return}
  const elapsed=(performance.now()-E.t0)/1000;$('etm').textContent=mm(elapsed);
  if(elapsed>=MAX)finish(true);
}
function halt(){
  E.generation++;clearInterval(E.iv);E.capture?.dispose();E.capture=null;
  E.controller?.abort();E.controller=null;
}
podium.leave=(p=>()=>{setFullscreen(false);try{p&&p()}catch(e){}halt();E.blob=null;E.pend=null;E.save=false;E.st='idle'})(podium.leave);
window.addEventListener?.('pagehide',halt);
window.PTCloud?.client?.auth.onAuthStateChange((_event,session)=>{if(E.owner&&session?.user?.id!==E.owner){halt();E.blob=null;E.pend=null;E.save=false;E.st='idle';E.owner=null}});
async function finish(auto){
  if(E.st!=='rec')return;
  const elapsed=(performance.now()-E.t0)/1000;
  if(elapsed<MIN&&!auto){note('Present the slide ideas for at least '+MIN+' seconds; aim for 2-3 minutes. No baseline has been awarded.');return}
  E.total=elapsed;clearInterval(E.iv);setE({st:'busy'});
  const generation=E.generation;
  try{const blob=await E.capture.finish();if(generation!==E.generation)return;E.blob=blob;E.capture.dispose();E.capture=null;await analyze()}
  catch(error){if(generation===E.generation){E.capture?.dispose();E.capture=null;setE({st:'err',msg:error.message||'Recording could not finish. Please try again.'})}}
}
async function analyze(){
  if(!E.blob||window.PTCloud?.user?.id!==E.owner)return;
  const generation=E.generation;E.controller=new AbortController();setE({st:'busy'});
  try{
    const results=await window.PTPracticeAudio.analyze(E.blob,150,E.controller.signal,note,undefined,'evaluation');
    if(generation!==E.generation||window.PTCloud?.user?.id!==E.owner)return;
    if(results.source!=='recorded-evaluation'||results.contentValidation?.eligible!==true||!Number.isFinite(results.score))throw new Error('No valid baseline was returned. Please record the presentation again.');
    E.blob=null;return await commit(results);
  }catch(error){if(generation===E.generation){if(error.status===422)E.blob=null;setE({st:'err',msg:error.message||'Analysis could not finish. Please retry.'})}}
}
/* Cloud accounts: the SERVER must accept the result first (it sets the flag that unlocks uploads).
   If that fails nothing is unlocked and the user can retry saving without recording again. */
async function commit(results){
  const generation=E.generation,owner=E.owner;
  const cloud=window.PTCloud&&PTCloud.enabled;
  if(cloud){
    setE({st:'busy'});
    const c=await PTCloud.completeEvaluation(results);
    if(generation!==E.generation||window.PTCloud?.user?.id!==owner)return;
    if(c.error){E.pend=c.invalid?null:results;return setE({st:'err',msg:c.error,warn:[],save:!c.invalid&&c.retryable!==false})}
  }
  E.pend=null;E.save=false;
  const metrics=results.metrics||{};
  S.ev={done:true,at:results.created_at,results};S.evalRequired=false;S.assessRequired=false;
  const x={id:S.nid++,deck:'Initial Evaluation',d:today(),at:results.created_at||new Date().toISOString(),dur:Math.round(metrics.totalDurationSec||0),wpm:Math.round(metrics.wpm||0),fill:metrics.fillerCount||0,pau:metrics.pauseCount||0,score:results.score,tg:150,assess:true,source:'recorded-evaluation',contentValidation:results.contentValidation};
  const i=S.ses.findIndex(q=>q.assess);if(i>=0)S.ses.splice(i,1);S.ses.push(x);
  E.retake=false;E.st='idle';
  let saved=true;
  if(window.PTCloud&&PTCloud.enabled){const r=await PTCloud.saveNow(podium.snapshot());if(r.error)saved=false}else podium.save&&podium.save();
  if(generation!==E.generation||window.PTCloud?.user?.id!==owner)return;
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
  const fi=(m.fillers||[]).filter(f=>Number.isFinite(f.t)).map(f=>`<rect x="${x(f.t)-1.5}" y="14" width="3" height="42" rx="1.5" fill="#E8930C" style="filter:none"><title>${esc(f.word)} at ${mm(f.t)}</title></rect>`).join('');
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
  if(saved&&saved.source!=='recorded-evaluation')return page('Evaluation results','Retake needed',sec('PREVIOUS EVALUATION',1,'<p>Your previous browser-only evaluation did not verify the slide content or measure audio word timings. Its score and filler/pause counts are not a validated baseline. Take a new recorded evaluation to get a reliable starting point.</p><button class="bt" data-act="eretake" type="button">Retake evaluation</button>'));
  if(saved&&(saved.contentValidation?.eligible!==true||!Number.isFinite(saved.score)))return page('Evaluation results','No baseline awarded',sec('RETAKE EVALUATION',1,'<p>This recording has no validated baseline. Present the slide ideas and record again.</p><button class="bt" data-act="eretake" type="button">Retake evaluation</button>'));
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
      <div class="er-intro"><span class="er-eyebrow">YOUR SPEAKING SNAPSHOT</span><h2>A starting point for stronger presentations.</h2><div class="er-meta"><span class="st ${cl[1]}">${cl[0]}</span><span>${esc(date)}</span></div><p>Your speech passed the slide-content check. This delivery baseline estimates pace, fillers, pauses and talk length; it is not a grade for factual accuracy.</p></div>
      <div class="er-focus"><span class="er-icon">${reportIcon('target')}</span><span class="er-eyebrow">YOUR NEXT FOCUS</span><p>${esc((f.recommendations||[])[0]||'Review your delivery below and choose one skill to practice.')}</p><a class="er-link" href="#evaluation-plan">See your practice plan ${reportIcon('arrow')}</a></div>
    </section>
    <div class="er-metrics">
      ${metric('pace','Estimated pace',wpm,'WPM',r.dims?.pace?.label||'Recognized speaking speed')}
      ${metric('words','Words spoken',num(m.words),'words','Recognized in this evaluation')}
      ${metric('time','Talk duration',mm(duration),'',`Target ${mm(targetMin)} to ${mm(targetMax)}`)}
      ${metric('fill','Filler words',Number.isFinite(m.fillerCount)?m.fillerCount:'—','detected',m.fillerBasis==='verbatim-audio-transcript'?'Estimated from verbatim audio':'Audio transcript estimate; some fillers may be missed')}
      ${metric('pause','Long pauses',Number.isFinite(m.pauseCount)?m.pauseCount:'—','detected','Audio timestamp gaps of 2 seconds or longer')}
    </div>
    <div class="er-analysis">
      <section class="er-panel"><span class="er-eyebrow">DELIVERY INSIGHTS</span><h3>Find your speaking rhythm</h3><div class="er-chart-title"><b>${wpm} <small>WPM</small></b><span>Reference ${min}&ndash;${max} WPM</span></div>
        <div class="er-pace" role="img" aria-label="Pace ${wpm} WPM; target ${min} to ${max} WPM"><i style="left:${min/scale*100}%;width:${(max-min)/scale*100}%"></i><b style="left:${wpm/scale*100}%"></b></div>
        <div class="er-axis"><span>0</span><span>Words per minute</span><span>${Math.ceil(scale)}</span></div>
        <div class="er-duration"><div><strong>Presentation length</strong><span>${mm(duration)} / ${mm(targetMin)}&ndash;${mm(targetMax)} target</span></div><progress max="${Math.max(targetMax,duration,1)}" value="${duration}" aria-label="Presentation duration"></progress><p>${esc({too_short:'Give each main point a little more room.',within_range:'Your talk fits the target duration.',too_long:'Focus on your key points to fit the time.'}[d.status]||'Compare your talk length with the target.')}</p></div>
      </section>
      <section class="er-panel"><span class="er-eyebrow">SCORE BREAKDOWN</span><h3>What shaped your baseline</h3>${dims.length?dims.map(([key,v])=>`<div class="er-dimension"><div><span>${esc(dimNames[key]||key)}</span><b>${num(v.points)} / 2</b></div><progress max="2" value="${Math.min(2,num(v.points))}" aria-label="${esc(dimNames[key]||key)} score"></progress><small>${esc(v.label||'')}</small></div>`).join(''):'<p class="sub">A detailed score breakdown is not available for this saved evaluation.</p>'}</section>
    </div>
    <section class="er-panel er-timeline"><div class="er-section-head"><div><span class="er-eyebrow">MOMENTS IN YOUR TALK</span><h3>Your delivery timeline</h3></div><span class="er-tag">${mm(duration)} total</span></div>${timeline(m)}${!(m.fillers||[]).length&&!(m.pauses||[]).length?'<p class="er-empty">No filler or long-pause markers were detected in this evaluation.</p>':''}<p class="basis">Pause markers use audio word timestamps. Fillers from a separate verbatim transcript have no precise positions and are listed in the transcript instead.</p></section>
    <section id="evaluation-plan" class="er-plan"><span class="er-eyebrow">WHAT TO PRACTICE NEXT</span><h2>Turn feedback into your next rehearsal.</h2><div class="er-coaching"><article class="er-panel er-strength"><h3>${reportIcon('check')} Keep doing</h3>${list(f.strengths)}</article><article class="er-panel er-improve"><h3>${reportIcon('target')} Give attention to</h3>${list(f.improvements)}</article></div>
      <ol class="er-steps">${(f.recommendations||[]).map((t,i)=>`<li><span>${String(i+1).padStart(2,'0')}</span><p>${esc(t)}</p></li>`).join('')}</ol>
      <div class="er-actions"><button class="bt" data-go="up" type="button">Practice with your presentation ${reportIcon('arrow')}</button><button class="bt gh" data-go="hist" type="button">Practice history</button><button class="bt gh" data-act="eretake" type="button">Retake evaluation</button></div>
    </section>
    <details class="er-panel er-method" ${q.level==='low'?'open':''}><summary>${reportIcon('words')} Recognition quality &amp; how this was measured${q.level==='low'?' - Low-confidence recording':''}</summary><p>${esc(r.explanation||'This is a baseline, not a definitive judgment of your speaking ability.')}</p>${list(q.warnings)}<p>Pace is recognized words divided by recorded audio minutes, including pauses. Long pauses are gaps of at least 2 seconds between timestamped words, excluding leading and trailing silence. Fillers are estimated from the audio transcript and an additional verbatim pass when available. Zero detected does not prove none occurred. Eye contact, confidence and body language are not evaluated.</p>${f.summary?`<p>${esc(f.summary)}</p>`:''}<p>The 100-160 WPM range is a presentation coaching reference, not a universal standard. Clarity depends on content and audience. The content check requires meaningful speech about several slide sections before a delivery score is awarded. It uses vocabulary overlap, not semantic grading; substantial paraphrasing or recognition errors may require a retake.</p>${r.transcript?`<details><summary>Review recognized transcript</summary><p>${esc(r.verbatimTranscript||r.transcript)}</p></details>`:''}</details>
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
  else if(a==='eanalyze'){if(E.st==='err'&&E.blob)analyze()}
  else if(a==='efin')finish(false);
  else if(a==='ecancel'){halt();setE({st:'idle'})}
  else if(a==='eretake'){E.retake=true;E.st='idle';E.slide=0;go('eval')}
});
})();
