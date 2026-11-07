/* Dashboard overview: real account data, distinct baseline and rehearsal states. */
(() => {
  const { S,V,esc,fmt,ic,I,pendingEval } = podium.ext;
  const oldDashboard=V.dash;
  const icon=name=>ic(I[name]||I.goal);
  const button=(label,view,id='',style='')=>`<button type="button" class="bt ${style}" data-go="${view}" data-a="${esc(id)}">${label}</button>`;
  const number=v=>Number.isFinite(Number(v))?Math.max(0,Number(v)):0;
  const heading=(eyebrow,title,action='')=>`<header class="dh-section-head"><div><span class="dh-eyebrow">${eyebrow}</span><h2>${title}</h2></div>${action}</header>`;
  function scoreChart(sessions){
    const data=sessions.slice(-8),x=i=>data.length===1?260:38+i*444/(data.length-1),y=n=>162-Math.min(100,number(n))*1.26;
    const points=data.map((s,i)=>`${x(i)},${y(s.score)}`).join(' ');
    return `<svg class="dh-chart" viewBox="0 0 520 208" role="img" aria-label="Scores for the last ${data.length} analyzed sessions">${[0,50,100].map(n=>`<line x1="38" x2="482" y1="${y(n)}" y2="${y(n)}"/><text x="10" y="${y(n)+4}">${n}</text>`).join('')}${data.length>1?`<polygon class="dh-chart-area" points="38,162 ${points} 482,162"/><polyline points="${points}"/>`:''}${data.map((s,i)=>`<circle cx="${x(i)}" cy="${y(s.score)}" r="5"><title>${esc(s.deck)}: ${number(s.score)}%, ${esc(s.d)}</title></circle><text x="${x(i)}" y="${y(s.score)-12}" text-anchor="middle">${number(s.score)}%</text><text x="${x(i)}" y="190" text-anchor="middle">${sessions.length-data.length+i+1}</text>`).join('')}</svg>`;
  }
  V.dash=()=>{
    if(S.loading)return oldDashboard();
    const sessions=S.ses.filter(s=>!s.assess&&s.analysis),latest=sessions.at(-1),baseline=S.ev?.results;
    const required=pendingEval(),step=required?0:!S.pres.length?1:!sessions.length?2:3;
    const scheduled=S.pres.filter(p=>p.left!=null&&!p.final).sort((a,b)=>a.left-b.left);
    const deck=scheduled[0]||S.pres.find(p=>p.id===latest?.deckId)||S.pres[0];
    const target=required?'eval':deck?'prac':'up',targetId=deck?.id||'';
    const mainTitle=required?'Start with your speaking baseline.':!deck?'Your next great talk starts here.':'Make your next rehearsal count.';
    const primary=required?'Start evaluation':!deck?'Add your presentation':'Start a rehearsal';
    const steps=[['Evaluation','Know your starting point','eval','goal'],['Your slides','Bring your own presentation','up','decks'],['Rehearsal','Speak, record and practice','prac','prac'],['Feedback','Review and refine','perf','prog']];
    const totalMinutes=Math.round(sessions.reduce((sum,s)=>sum+number(s.dur),0)/60);
    const metric=(name,value,unit,detail,glyph)=>`<article class="dh-stat"><span class="dh-icon">${icon(glyph)}</span><div><h3>${name}</h3><strong>${value}<small>${unit}</small></strong><p>${detail}</p></div></article>`;
    const baselineWpm=baseline?.metrics?.totalDurationSec>0?Math.round(number(baseline.metrics.words)*60/baseline.metrics.totalDurationSec):null;
    const progress=sessions.length?`${heading('YOUR PERFORMANCE','Every rehearsal tells a story',button('Explore progress','prog','','gh sm'))}${scoreChart(sessions)}<p class="dh-caption">Performance score · last ${Math.min(8,sessions.length)} analyzed ${sessions.length===1?'session':'sessions'}. Compare the same presentation in Progress.</p>`:
      `${heading('YOUR PERFORMANCE','Build on your starting point')}
       <div class="dh-baseline"><span class="dh-big-icon">${icon('goal')}</span><div><span class="dh-tag">${baseline?'Baseline recorded':'Your first milestone'}</span><h3>${baseline?'You have a starting point.':'Meet your speaking baseline.'}</h3><p>${baseline?'Your evaluation is saved. Practice with your own slides to begin tracking change.':'Take the built-in evaluation before adding your own slides.'}</p></div></div>
       ${baseline?`<div class="dh-baseline-facts"><div><b>${baselineWpm??'—'}<small> WPM</small></b><span>Estimated pace</span></div><div><b>${fmt(number(baseline.metrics?.totalDurationSec))}</b><span>Evaluation length</span></div><div><b>${number(baseline.metrics?.fillerCount)}</b><span>Detected fillers</span></div></div>`:''}
       <div class="acts">${button(baseline?'View evaluation results':'Take evaluation','eval','','gh sm')}</div>`;
    const preparation=deck?PTWorkspaceModel.preparation(deck,S.ses):null;
    const readinessItems=preparation?.items||[];
    const completed=preparation?.done||0;
    const readiness=preparation?.percent||0;
    const recommendation=latest?.analysis?.feedback?.recommendations?.[0]|| (required?'Start with the short evaluation to see which speaking skills to focus on.':deck?'Choose one main point, rehearse it aloud, then review your feedback.':'Bring a presentation you know well. Familiar content helps you focus on delivery.');
    const recent=S.ses.filter(s=>s.analysis||s.assess).slice(-3).reverse();
    const notes=S.notes.filter((n,i,a)=>a.findIndex(x=>x.t===n.t&&x.s===n.s)===i).slice(0,2);
    return `<div class="dashboard-home">
      ${S.flash?`<div class="bn ok" role="status"><b>${esc(S.flash)}</b><button class="x" data-act="flashx" aria-label="Dismiss">×</button></div>`:''}
      <header class="dh-welcome wel"><div><span class="dh-eyebrow">YOUR PRESENTATION WORKSPACE</span><h1>Welcome back, ${esc(S.u.name.split(' ')[0]||'presenter')}.</h1><p>Small rehearsals. Clear feedback. Steady progress.</p></div><span class="dh-date">${icon('hist')}${new Date().toLocaleDateString('en',{month:'short',day:'numeric',year:'numeric'})}</span></header>
      <section class="dh-hero nx"><div class="dh-hero-copy"><span class="dh-tag">${required?'STEP 01 · EVALUATE':!deck?'STEP 02 · PREPARE':'YOUR NEXT REHEARSAL'}</span><h2>${mainTitle}</h2><p>${required?'A short guided talk helps you understand your pace, pauses and timing.':!deck?'You have your baseline. Now bring your slides, find your rhythm, and practice with purpose.':`Continue with <strong>${esc(deck.t)}</strong>. Give yourself ${Math.round(number(deck.target)/60)} minutes to focus on your delivery.`}</p><div class="acts">${button(primary+' &rarr;',target,targetId)}${button('My presentations','decks','','gh')}</div>${deck?`<span class="dh-hero-note">${icon('pace')} ${Math.round(number(deck.target)/60)} minute target <span>·</span> ${deck.left!=null?esc(deck.date):'No presentation date set'}</span>`:''}</div>
        <div class="dh-journey" aria-label="Presentation preparation steps">${steps.map(([title,detail,view,glyph],i)=>`<button class="dh-step ${i<step?'done':i===step?'current':''}" data-go="${view}" type="button" ${i===step?'aria-current="step"':''}><span class="dh-step-icon">${i<step?'✓':icon(glyph)}</span><span><b>${title}</b><small>${detail}</small></span><em>${i<step?'Done':i===step?'Next':String(i+1).padStart(2,'0')}</em></button>`).join('')}</div>
      </section>
      <div class="dh-stats g-perf">${metric('Presentations',S.pres.length,'','In your workspace','decks')}${metric('Practice sessions',sessions.length,'','Analyzed rehearsals','prac')}${metric('Time rehearsed',totalMinutes,'min','Across analyzed sessions','pace')}${metric('Latest practice score',latest?Math.round(number(latest.score)):'—',latest?'%':'',latest?'From your latest rehearsal':'Appears after your first rehearsal','star')}</div>
      <div class="dh-grid g-prog"><section class="dh-panel">${progress}</section><section class="dh-panel dh-coach coach"><span class="dh-icon">${icon('goal')}</span><span class="dh-eyebrow">YOUR PRACTICE COMPANION</span><h2>One focus.<br>A better next attempt.</h2><p>${esc(recommendation)}</p><span class="dh-caption">${latest?'Based on your latest analyzed rehearsal':'A preparation tip to get you started'}</span><div class="acts">${button(latest?'Open coaching feedback':'Take the next step',latest?'coach':target,targetId,'gh sm')}</div></section></div>
      <div class="dh-grid g-next"><section class="dh-panel"><header class="dh-section-head"><div><span class="dh-eyebrow">RECENT ACTIVITY</span><h2>Your latest sessions</h2></div>${button('View history','hist','','gh sm')}</header><div data-sec="recent-practice">${recent.length?recent.map(s=>`<div class="dh-session"><span class="dh-icon">${icon(s.assess?'goal':'prac')}</span><div><b>${esc(s.deck)}</b><small>${s.assess?'Pre-evaluation':'Analyzed practice'} · ${esc(s.d)} · ${fmt(number(s.dur))}</small></div>${button('View report',s.assess?'eval':'rdet',s.id,'gh sm')}</div>`).join(''):`<div class="dh-empty">${icon('hist')}<h3>Your practice story starts here.</h3><p>Completed evaluations and analyzed rehearsals will appear in this space.</p></div>`}</div></section>
      <section class="dh-panel dh-readiness">${heading('PREPARATION CHECKLIST','Ready for the room?')}<div class="dh-ready-summary"><div class="dh-mini-ring" style="--progress:${readiness}%" role="img" aria-label="${readiness}% of preparation checklist complete"><span>${deck?readiness+'%':'—'}</span></div><div><b>${deck?esc(deck.t):'Your presentation checklist'}</b><p>${deck?`${completed} of 6 preparation activities complete`:'Add slides to start tracking your preparation.'}</p></div></div>${deck?`<ul class="dh-checks">${readinessItems.map(([title,done])=>`<li class="${done?'done':''}"><span>${done?'✓':'○'}</span>${title}</li>`).join('')}</ul>${button('Update checklist','ready',deck.id,'gh sm')}`:`<div class="dh-check-preview"><span>${icon('decks')} Bring your slides</span><span>${icon('prac')} Rehearse your delivery</span><span>${icon('check')} Review your preparation</span></div>${button('Add presentation',target,'','gh sm')}`}<p class="dh-caption">Readiness tracks preparation activities, not a guarantee of performance.</p></section></div>
      <footer class="dh-footer"><div>${notes.length?`<span class="dh-eyebrow">LATEST UPDATE</span><p>${esc(notes[0].t)} <span>· ${esc(notes[0].s)}</span></p>`:'<p>Make a little time for your next rehearsal.</p>'}</div><div class="acts">${button('Notifications','note','','gh sm')}<button class="bt gh sm" data-act="robotmin" id="rbtn" type="button">Minimize Tracy</button></div></footer>
    </div>`;
  };
})();
