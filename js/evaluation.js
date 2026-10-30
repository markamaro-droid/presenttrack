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
PARENT.eval='decks';PARENT.evres='decks';
const TOPICS=[
 {t:'Tell us about your favorite hobby and why you enjoy it.',c:['What the hobby is','How you got started','Why you would recommend it']},
 {t:'Describe a place in your city that you would recommend to a visitor.',c:['Where it is and what it looks like','What people can do there','Why it is special to you']},
 {t:'Explain why a daily walk is a good habit.',c:['How it helps your body and mood','A walk you remember','How a beginner can start']},
 {t:'Describe a typical day in your life and what you enjoy most about it.',c:['Morning to evening','The best part of your day','One thing you would change']}];
const E={st:'idle',topic:TOPICS[Math.floor(Math.random()*TOPICS.length)],segs:{},ses:0,want:false,rec:null,iv:0,t0:0,total:0,fatal:null,retake:false};

/* shared analysis code (same files the Supabase functions use) */
let CORE=null;
const core=()=>CORE||(CORE=Promise.all([import('../supabase/functions/_shared/metrics.js'),import('../supabase/functions/_shared/quality.js'),import('../supabase/functions/_shared/classify.js'),import('../supabase/functions/_shared/feedback.js'),import('../supabase/functions/_shared/criteria.js')])
  .then(([m,q,c,f,k])=>({computeMetrics:m.computeMetrics,assessQuality:q.assessQuality,classify:c.classify,ruleBasedFeedback:f.ruleBasedFeedback,CRITERIA:k.CRITERIA}))
  .catch(e=>{CORE=null;throw e}));

/* ---------- evaluation page ---------- */
V.eval=()=>{
  if(S.ev&&S.ev.done&&!E.retake)return V.evres();
  if(!S.evalRequired&&!E.retake)return page('Start Evaluation','',sec('NOT NEEDED',1,nodata('Your account does not need the evaluation. You can upload your presentations right away.','<button class="bt" data-go="up" type="button">UPLOAD PPT</button>')));
  const tp=E.topic;
  return page('Start Evaluation','A short talk so we can measure how you speak today.',
   sec('HOW IT WORKS',1,`<ul class="tp"><li>You will talk for about <b>2 to 3 minutes</b> on the topic below, out loud, in your own words. Do not read from a script.</li><li>We measure your <b>speaking speed (words per minute)</b>, the <b>filler words</b> you use (um, uh, like, you know, ano) and your <b>long pauses</b> (2 seconds or more).</li><li>Your <b>presentation time</b> is compared with the 2 to 3 minute target.</li><li>This is a <b>baseline</b>, not a final judgment of your ability. Eye contact, gestures and body language are not measured.</li><li>Use <b>Google Chrome or Microsoft Edge</b>, allow the microphone, and find a quiet place. Nothing is recorded or uploaded: only the words you say are analyzed in your browser.</li></ul>`)
   +sec('YOUR TOPIC',2,`<h2 class="pt" style="font-size:20px">${esc(tp.t)}</h2><p class="sub" style="margin:0 0 6px">You could mention:</p><ul class="tp" style="margin-bottom:0">${tp.c.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`)
   +sec('RECORD YOUR TALK',3,'<div id="erec"></div>'));
};
B.eval=()=>draw();
function setE(o){Object.assign(E,o);draw()}
function draw(){
  const h=$('erec');if(!h)return;let b='';
  if(E.st==='idle')b=`<div class="arec"><div class="atm"><b id="etm">0:00</b><small>Recommended: 2 to 3 minutes</small></div><p class="sub" style="margin:0">Press Start, then talk about the topic. Press Finish when you are done.</p><div class="acts"><button class="bt" data-act="estart" type="button">START</button></div></div>`;
  else if(E.st==='ask')b=`<div class="alo" role="status"><i></i>Waiting for microphone permission…</div>`;
  else if(E.st==='rec')b=`<div class="arec" style="width:100%"><div class="atm rec"><b id="etm">0:00</b><small>● Listening</small></div><p class="ai" id="elive" aria-live="polite" style="margin:0;width:100%;box-sizing:border-box;min-height:3.2em">Start talking…</p><p class="vnote" id="enote" role="status" style="text-align:left"></p><div class="acts"><button class="bt" data-act="efin" type="button">FINISH</button><button class="bt gh" data-act="ecancel" type="button">Cancel</button></div></div>`;
  else if(E.st==='busy')b=`<div class="alo" role="status"><i></i>Analyzing your speech…</div>`;
  else if(E.st==='err')b=`<div class="arec"><p class="wr" role="alert">${esc(E.msg||'Something went wrong.')}</p>${(E.warn||[]).length?`<ul class="tp">${E.warn.map(w=>`<li>${esc(w)}</li>`).join('')}</ul>`:''}<div class="acts"><button class="bt" data-act="estart" type="button">TRY AGAIN</button></div></div>`;
  h.innerHTML=b;
}
const note=m=>{const n=$('enote');if(n)n.textContent=m};

/* ---------- listening ---------- */
async function start(){
  if(E.st==='ask'||E.st==='rec'||E.st==='busy')return;
  if(!SR||!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia)return setE({st:'err',msg:'This browser cannot do speech recognition. Please open PresentTrack in Google Chrome or Microsoft Edge on a computer or Android phone.',warn:[]});
  setE({st:'ask'});
  try{const s=await navigator.mediaDevices.getUserMedia({audio:true});s.getTracks().forEach(t=>t.stop())}
  catch(e){return setE({st:'err',msg:e&&e.name==='NotFoundError'?'No microphone was found. Connect one and try again.':'Microphone access was blocked. Allow it for this site in your browser settings, then try again.',warn:[]})}
  if(!$('erec'))return;
  E.segs={};E.ses=0;E.fatal=null;E.want=true;E.t0=performance.now();clearInterval(E.iv);E.iv=setInterval(tick,250);
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
podium.leave=(p=>()=>{try{p&&p()}catch(e){}if(E.st==='rec'||E.st==='ask'){halt();E.st='idle'}})(podium.leave);

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
  const result=C.classify(metrics,quality,C.CRITERIA),feedback=C.ruleBasedFeedback(metrics,result);
  const results={version:1,source:'browser-speech-recognition',topic:E.topic.t,quality,metrics,durationAssessment:result.durationAssessment,dims:result.dims,totalPoints:result.totalPoints,maxPoints:result.maxPoints,score:result.score,classification:result.classification,explanation:result.explanation,feedback,transcript:segs.map(g=>g.text).join(' ').slice(0,6000),created_at:new Date().toISOString()};
  S.ev={done:true,at:results.created_at,results};
  const x={id:S.nid++,deck:'Initial Evaluation',d:today(),dur:Math.round(metrics.totalDurationSec),wpm:Math.round(metrics.wpm),fill:metrics.fillerCount,pau:metrics.pauseCount,score:result.score,tg:150,assess:true};
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
V.evres=()=>{
  const r=S.ev&&S.ev.results;
  if(!r)return page('Evaluation results','',sec('RESULTS',1,nodata('You have not taken the evaluation yet.',S.evalRequired?'<button class="bt" data-go="eval" type="button">START EVALUATION</button>':'')));
  const m=r.metrics||{},q=r.quality||{},d=r.durationAssessment||{},f=r.feedback||{},cl=CLASS[r.classification]||['Result',''];
  const dst={too_short:'Shorter than the 2 to 3 minute target',within_range:'Within the 2 to 3 minute target',too_long:'Longer than the 2 to 3 minute target'}[d.status]||'';
  const list=a=>(a&&a.length)?`<ul class="tp">${a.map(t=>`<li>${esc(t)}</li>`).join('')}</ul>`:'<p class="em">Nothing to show here.</p>';
  const card=(n,v,s)=>`<article class="mc"><h4>${n}</h4><p class="mv">${v}</p>${s?`<small>${s}</small>`:''}</article>`;
  const fb=Object.entries(m.fillerByWord||{}).map(([w,c])=>esc(w)+' ×'+c).join(', ');
  const ft=(m.fillers||[]).slice(0,40).map(x=>esc(x.word)+(x.heuristic?'*':'')+' '+mm(x.t)).join(' · ');
  const pt=(m.pauses||[]).map(p=>mm(p.t)+' ('+p.dur+'s)').join(' · ');
  return page('Evaluation results','Your speaking baseline.',
   sec('YOUR BASELINE',1,`<p class="sub" style="margin:0 0 8px"><span class="st ${cl[1]}">${cl[0]}</span> &nbsp; Score ${Math.round(r.score||0)}%</p><p class="sub" style="margin:0">${esc(r.explanation||'')}</p>`)
   +`<div class="g-perf five">${card('Speaking speed',Math.round(m.wpm||0)+' <small>WPM</small>',esc((r.dims&&r.dims.pace&&r.dims.pace.label)||''))}${card('Total words',m.words||0,'')}${card('Presentation time',mm(m.totalDurationSec),esc(dst))}${card('Filler words',m.fillerCount||0,fb||'None detected')}${card('Long pauses',m.pauseCount||0,m.pauseCount?'Longest '+(m.longestPause||0)+'s':'None of 2 s or more')}</div>`
   +(q.level==='low'||(q.warnings||[]).length?sec('RECORDING QUALITY',2,list(q.warnings)+(q.level==='low'?'<div class="acts"><button class="bt gh" data-act="eretake" type="button">TAKE IT AGAIN</button></div>':'')):'')
   +sec('TALK TIMELINE',3,timeline(m)+(ft?`<p class="basis" style="margin:10px 0 0"><b>Filler words:</b> ${ft}${(m.heuristicFillerCount||0)?'<br>* "like" is only counted when it looks like a filler, so these are possible fillers.':''}</p>`:'')+(pt?`<p class="basis" style="margin:6px 0 0"><b>Long pauses:</b> ${pt}</p>`:''))
   +sec('FEEDBACK',4,`<p class="rec">${esc(f.summary||'')}</p><h4 class="plb" style="margin:10px 0 4px">Strengths</h4>${list(f.strengths)}<h4 class="plb" style="margin:10px 0 4px">Areas to improve</h4>${list(f.improvements)}<h4 class="plb" style="margin:10px 0 4px">Next practice session</h4>${list(f.recommendations)}`)
   +sec('HOW THIS WAS MEASURED',5,`<ul class="tp"><li>Speaking speed = spoken words ÷ speaking time in minutes. Pauses of 2 seconds or longer are <b>not</b> counted as speaking time; shorter pauses are.</li><li>Words and timing come from your browser's speech recognition, which can miss or add words and often skips "um" and "uh". Filler and pause counts are estimates, not definite mistakes.</li><li>Presentation time is the full length of your talk, compared with a 2 to 3 minute target.</li></ul><div class="acts"><button class="bt" data-go="up" type="button">UPLOAD PPT</button><button class="bt gh" data-go="hist" type="button">PRACTICE HISTORY</button></div>`));
};

$('app').addEventListener('click',e=>{
  const t=e.target.closest('[data-act]');if(!t)return;const a=t.dataset.act;
  if(a==='estart')start();
  else if(a==='efin')finish(false);
  else if(a==='ecancel'){halt();setE({st:'idle'})}
  else if(a==='eretake'){E.retake=true;E.st='idle';go('eval')}
});
})();
