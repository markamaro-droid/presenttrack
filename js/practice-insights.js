/* Extend existing modules with measured-session comparison and preparation controls. */
(() => {
  const { S,V,B,go,render,page,sec,esc,fmt,find } = podium.ext;
  const $ = id => document.getElementById(id);
  const sessions = () => S.ses.filter(x => !x.assess && x.analysis && (!S.compareDeck || String(x.deckId) === String(S.compareDeck)));
  const selector = () => `<section class="pn"><label for="compare-deck">Compare presentation</label><select id="compare-deck"><option value="">All analyzed practice sessions</option>${S.pres.map(p=>`<option value="${p.id}"${String(S.compareDeck)===String(p.id)?' selected':''}>${esc(p.t)}</option>`).join('')}</select><p class="basis">Only sessions with recorded-audio analysis are included. Legacy prototype scores remain in History but are excluded from comparisons.</p></section>`;
  for (const view of ['perf','prog']) {
    const oldView=V[view],oldBind=B[view];
    V[view]=()=>selector()+oldView()+comparison();
    B[view]=()=>{oldBind?.();$('compare-deck').onchange=e=>{S.compareDeck=e.target.value;render()};};
  }
  function comparison() {
    const baseline=S.ev?.results,latest=sessions().at(-1);
    if(!baseline||!latest||baseline.source!=='recorded-evaluation'||baseline.contentValidation?.eligible!==true)return '';
    const m=baseline.metrics||{},rows=[['Estimated pace',m.totalDurationSec>0?Math.round(m.words*60/m.totalDurationSec):m.wpm,latest.wpm,'WPM'],['Fillers per minute',m.totalDurationSec>0?m.fillerCount*60/m.totalDurationSec:0,latest.fill*60/latest.dur,'/min'],['Long pauses per minute',m.totalDurationSec>0?m.pauseCount*60/m.totalDurationSec:0,latest.pau*60/latest.dur,'/min']];
    return sec('PRE-EVALUATION VS LATEST PRACTICE',4,`<div class="tw"><table><tr><th>Indicator</th><th>Pre-evaluation</th><th>Latest practice</th></tr>${rows.map(([label,a,b,unit])=>`<tr><td>${label}</td><td>${Number(a||0).toFixed(1)} ${unit}</td><td>${Number(b||0).toFixed(1)} ${unit}</td></tr>`).join('')}</table></div><p class="basis">Different topics, durations and recognition methods can affect these estimates. This comparison shows changes, not proof of improved ability.</p>`);
  }
  const weak=V.weak;
  V.weak=id=>{const latest=S.ses.filter(s=>!s.assess&&s.analysis&&(!id||String(s.deckId)===String(id))).at(-1);return (latest?sec('YOUR PRACTICE FOCUS',0,`<ul class="tp">${latest.analysis.feedback.recommendations.map(t=>`<li>${esc(t)}</li>`).join('')}</ul>`):'')+weak(id)};
  const ready=V.ready;
  V.ready=id=>{const p=find(id);return ready(id)+(p?sec('UPDATE PREPARATION',3,`<label for="ready-date">Presentation date</label><input id="ready-date" type="date"><label><input id="ready-profile" type="checkbox" ${p.sp?'checked':''}> Speaker profile prepared</label><label><input id="ready-final" type="checkbox" ${p.final?'checked':''}> I completed my final rehearsal</label><button class="bt" id="ready-save" type="button">Save preparation</button><p class="basis">Final rehearsal and profile status are self-reported. Recording quality and practice counts come from analyzed sessions.</p>`):'')};
  B.ready=id=>{const p=find(id);if(!p)return;$('ready-save').onclick=()=>{p.sp=$('ready-profile').checked;p.final=$('ready-final').checked;const value=$('ready-date').value;if(value){const date=new Date(value+'T12:00:00');p.date=date.toLocaleDateString();p.left=Math.ceil((date-new Date())/86400000)}podium.save();render()}};
})();
