/* Thesis-aligned review workspace. Existing upload, capture and evaluation flows remain in place. */
(() => {
  const { S, V, B, esc, fmt, ic, I, go, render, toast, pendingEval, confirmDlg } = podium.ext;
  const M = PTWorkspaceModel, $ = id => document.getElementById(id);
  const icon = key => ic(I[key] || I.goal);
  const btn = (label, view, id = '', extra = '') => `<button type="button" class="bt ${extra}" data-go="${view}" data-a="${esc(id)}">${label}</button>`;
  const metrics = { score: ['Performance score', '%', 'star'], wpm: ['Speaking pace', 'WPM', 'pace'], fillerRate: ['Filler frequency', '/min', 'fill'], pauseRate: ['Long-pause frequency', '/min', 'pause'], dur: ['Duration', '', 'hist'] };
  const show = (v, key) => v === null || !Number.isFinite(v) ? '—' : key === 'dur' ? (v < 0 ? '−' : '') + fmt(Math.abs(v)) : Number(v.toFixed(1)).toString();
  const head = (tag, title, sub, action = '') => `<header class="ws-head"><div><span class="dh-eyebrow">${tag}</span><h1>${title}</h1><p>${sub}</p></div><div class="acts">${action}</div></header>`;
  const panel = (title, body, tag = '', extra = '') => `<section class="ws-panel ${extra}"><header class="ws-panel-head"><div>${tag ? `<span class="dh-eyebrow">${tag}</span>` : ''}<h2>${title}</h2></div></header>${body}</section>`;
  const wrap = content => `<div class="workspace">${content}</div>`;
  const options = (values, current) => values.map(([v, t]) => `<option value="${esc(v)}"${String(v) === String(current) ? ' selected' : ''}>${esc(t)}</option>`).join('');
  const deckOptions = current => options([['', 'All presentations'], ...S.pres.map(p => [p.id, p.t])], current);
  const all = () => M.select(S.ses);
  const filtered = () => M.select(S.ses, { deck: S.compareDeck, days: S.reviewDays });
  // Preview fixtures stay outside account state and are never persisted or exported.
  let progressPreview = null;
  const previewEnabled = () => progressPreview ?? !all().length;
  const sampleAttempts = () => [
    [58, 184, 24, 12, 362], [65, 172, 19, 10, 341],
    [71, 158, 16, 8, 326], [68, 165, 18, 9, 337],
    [80, 148, 11, 6, 311], [88, 140, 7, 4, 302]
  ].map(([score, wpm, fill, pau, dur], i) => {
    const at = new Date(Date.now() - (6 - i) * 86400000).toISOString();
    return { id: `preview-${i}`, deckId: 'preview', deck: 'Sample: Capstone presentation',
      sample: true, at, d: at.slice(0, 10), score, wpm, fill, pau, dur, tg: 300, analysis: {} };
  });
  function filters(history = false) {
    return `<section class="ws-filters" aria-label="Filter sessions"><div><label for="ws-deck">Presentation</label><select id="ws-deck">${deckOptions(S.compareDeck)}</select></div><div><label for="ws-days">Date range</label><select id="ws-days">${options([[0, 'All time'], [7, 'Last 7 days'], [30, 'Last 30 days'], [90, 'Last 90 days']], S.reviewDays || 0)}</select></div>${history ? `<div><label for="ws-type">Session type</label><select id="ws-type">${options([['all', 'All sessions'], ['analyzed', 'Analyzed practice'], ['evaluation', 'Pre-evaluation'], ['legacy', 'Legacy / unverified']], S.historyType || 'all')}</select></div><div><label for="ws-search">Search history</label><input id="ws-search" value="${esc(S.historyQuery || '')}" placeholder="Title or date" maxlength="100" type="search"></div>` : ''}<button class="bt gh sm" id="ws-clear" type="button">Reset filters</button></section>`;
  }
  function bindFilters(history = false) {
    $('ws-deck').onchange = e => { S.compareDeck = e.target.value; S.compareA = S.compareB = ''; render(); };
    $('ws-days').onchange = e => { S.reviewDays = +e.target.value; S.compareA = S.compareB = ''; render(); };
    $('ws-clear').onclick = () => { S.compareDeck = ''; S.reviewDays = 0; S.historyType = 'all'; S.historyQuery = ''; S.compareA = S.compareB = ''; render(); };
    if (history) {
      $('ws-type').onchange = e => { S.historyType = e.target.value; render(); };
      $('ws-search').oninput = e => { const position = e.target.selectionStart; S.historyQuery = e.target.value; render(); $('ws-search').focus(); try { $('ws-search').setSelectionRange(position, position); } catch {} };
    }
  }
  function stats(session, count) {
    return `<div class="ws-stats">${Object.entries(metrics).filter(([k]) => k !== 'dur').map(([k, [title, unit, glyph]]) => `<article class="ws-stat"><span class="dh-icon">${icon(glyph)}</span><h3>${title}</h3><strong>${show(M.value(session, k), k)} <small>${unit}</small></strong><p>${session?.assess ? k === 'score' ? 'Open evaluation for its rubric' : 'Pre-evaluation estimate' : session ? 'Latest selected rehearsal' : 'Available after practice'}</p></article>`).join('')}</div><p class="ws-caption">${count} analyzed ${count === 1 ? 'rehearsal' : 'rehearsals'} in this selection. Filler and pause frequencies use full recording minutes.</p>`;
  }
  function baselineCard() {
    const base = M.baseline(S.ev);
    return `<section class="ws-spotlight"><span class="ws-orbit">${icon(base ? 'goal' : 'prac')}</span><div><span class="dh-eyebrow">${base ? 'YOUR STARTING POINT' : 'BUILD YOUR PRACTICE RECORD'}</span><h2>${base ? 'Your baseline is ready to build on.' : 'Make your first rehearsal count.'}</h2><p>${base ? `${show(base.wpm, 'wpm')} WPM · ${show(base.dur, 'dur')} · ${show(base.fill)} detected fillers. Your evaluation stays separate from recorded practice trends.` : 'Start a short rehearsal, review the measured feedback, and repeat with one clear focus.'}</p><div class="acts">${btn(pendingEval() ? 'Start evaluation' : S.pres.length ? 'Start practice' : 'Add presentation', pendingEval() ? 'eval' : S.pres.length ? 'prac' : 'up')}${base ? btn('View baseline', 'evres', '', 'gh') : ''}</div></div></section>`;
  }
  function emptySelection() {
    return `<div class="ws-empty"><span class="dh-icon">${icon('prog')}</span><h3>${all().length ? 'No rehearsals match these filters.' : 'Your next attempt starts the trend.'}</h3><p>${all().length ? 'Reset the filters or choose a different presentation.' : 'After two analyzed rehearsals, compare how your delivery changes. One session appears as a single point.'}</p></div>`;
  }
  function trend(list, key) {
    const data = list.map((s, i) => ({ s, i, v: M.value(s, key) })).filter(x => x.v !== null).slice(-12);
    if (!data.length) return emptySelection();
    const high = key === 'score' ? 100 : Math.max(key === 'wpm' ? 180 : 1, ...data.map(x => x.v)) * 1.15;
    const X = i => data.length === 1 ? 306 : 48 + i * 516 / (data.length - 1), Y = v => 200 - v / high * 166;
    const pts = data.map((x, i) => `${X(i)},${Y(x.v)}`).join(' ');
    return `<svg class="ws-chart" viewBox="0 0 600 248" role="img" aria-label="${metrics[key][0]} across ${data.length} ${list[0]?.sample ? 'sample' : 'recorded'} rehearsals">${[0, high / 2, high].map(v => `<line x1="48" x2="564" y1="${Y(v)}" y2="${Y(v)}"/><text x="40" y="${Y(v) + 4}" text-anchor="end">${show(v, key)}</text>`).join('')}${key === 'wpm' ? `<rect class="ws-band" x="48" width="516" y="${Y(160)}" height="${Y(100) - Y(160)}"/>` : ''}${data.length > 1 ? `<polyline points="${pts}"/>` : ''}${data.map((x, i) => `<circle cx="${X(i)}" cy="${Y(x.v)}" r="5"><title>${esc(x.s.deck)} · ${esc(x.s.d)}: ${show(x.v, key)} ${metrics[key][1]}</title></circle><text x="${X(i)}" y="${Y(x.v) - 12}" text-anchor="middle">${show(x.v, key)}</text><text x="${X(i)}" y="228" text-anchor="middle">${x.i + 1}</text>`).join('')}</svg><p class="ws-caption">Attempt number · most recent 12 matching rehearsals${key === 'wpm' ? '. Shaded area: 100–160 WPM coaching reference; not a universal standard' : ''}.</p><details><summary>View chart data</summary>${table(data.map(x => x.s))}</details>`;
  }
  function table(list) {
    if (!list.length) return emptySelection();
    return `<div class="ws-table" tabindex="0" aria-label="Session results"><table><thead><tr><th>Presentation / source</th><th>Date</th><th>Duration</th><th>Pace</th><th>Fillers</th><th>Pauses</th><th>Score</th><th>Report</th></tr></thead><tbody>${list.map(s => `<tr><th scope="row">${esc(s.deck)}<small>${s.sample ? 'Sample practice (fictional)' : s.assess ? 'Pre-evaluation' : s.analysis ? 'Recorded practice' : 'Legacy / unverified'}</small></th><td>${esc(s.at ? new Date(s.at).toLocaleDateString() : s.d)}</td><td>${show(M.value(s, 'dur'), 'dur')}</td><td>${show(M.value(s, 'wpm'))} WPM</td><td>${show(M.value(s, 'fill'))}</td><td>${show(M.value(s, 'pau'))}</td><td>${show(M.value(s, 'score'))}%</td><td>${s.sample ? '<span class="ws-caption">Preview only</span>' : btn('Open', s.assess && S.ev ? 'evres' : 'rdet', s.id, 'gh sm')}</td></tr>`).join('')}</tbody></table></div>`;
  }
  function practicePlan(latest) {
    const feedback = latest?.analysis?.feedback || S.ev?.results?.feedback;
    const recommendations = feedback?.recommendations || [];
    return `<div class="ws-plan">${(recommendations.length ? recommendations : ['Choose one main point to rehearse.', 'Record a short attempt and review its feedback.', 'Repeat the same presentation to compare your delivery.']).slice(0, 3).map((t, i) => `<div><span>${String(i + 1).padStart(2, '0')}</span><p>${esc(t)}</p></div>`).join('')}</div><div class="acts">${btn('Practice with a focus', pendingEval() ? 'eval' : 'weak', latest?.deckId || '', 'sm')}${btn('Set a goal', 'goals', '', 'gh sm')}</div>`;
  }
  function compare(list) {
    const base = M.baseline(S.ev), candidates = [...(base ? [base] : []), ...list];
    if (candidates.length < 2) return panel('Compare two attempts', '<p>Add another analyzed rehearsal to compare it with your baseline or an earlier attempt.</p>' + btn('Start practice', pendingEval() ? 'eval' : 'prac', '', 'gh sm'), 'SIDE BY SIDE');
    const a = candidates.find(x => String(x.id) === S.compareA) || candidates[0];
    const b = candidates.find(x => String(x.id) === S.compareB) || candidates.at(-1);
    const opts = selected => options(candidates.map((s, i) => [s.id, s.assess ? 'Pre-evaluation baseline' : `${i + (base ? 0 : 1)}. ${s.deck} · ${s.d}`]), selected.id);
    return panel('Choose your comparison', `<div class="ws-pair"><div><label for="ws-a">Earlier / reference</label><select id="ws-a">${opts(a)}</select></div><div><label for="ws-b">Comparison attempt</label><select id="ws-b">${opts(b)}</select></div></div>${String(a.id) === String(b.id) ? '<p role="status">Choose two different attempts to see a change.</p>' : `<div class="ws-compare">${Object.entries(metrics).map(([k, [name, unit]]) => {
      const av = M.value(a, k), bv = M.value(b, k), max = k === 'score' ? 100 : Math.max(av || 0, bv || 0, 1);
      const delta = av !== null && bv !== null ? bv - av : null;
      return `<article><h3>${name} <small>${unit}</small></h3><div class="ws-bars">${[[av, 'Reference'], [bv, 'Comparison']].map(([v, label]) => `<div><span>${label}</span><i style="--bar:${v === null ? 0 : Math.max(0, v / max * 100)}%"></i><b>${show(v, k)}</b></div>`).join('')}</div><p>${delta === null ? 'Scores and targets may use different rubrics.' : `Change: ${delta > 0 ? '+' : ''}${show(delta, k)} ${unit}`}</p></article>`;
    }).join('')}</div>`}<p class="ws-caption">Compare similar topics and target lengths. More or less is not automatically better. Browser evaluation and recorded practice use different recognition methods.</p>`, 'SIDE BY SIDE');
  }
  V.perf = () => { const list = filtered(); return wrap(head('UNDERSTAND YOUR DELIVERY', 'Performance', 'Compare attempts. Find one useful adjustment.', btn('Practice now', pendingEval() ? 'eval' : 'prac')) + filters() + stats(list.at(-1) || M.baseline(S.ev), list.length) + (!list.length ? baselineCard() : '') + compare(list) + `<div class="ws-grid">${panel('Your next practice plan', practicePlan(list.at(-1)), 'TURN FEEDBACK INTO ACTION')}${panel('What these numbers mean', `<ul class="ws-guide"><li><b>Pace</b>Recognized words per recording minute; 100–160 WPM is a broad coaching reference.</li><li><b>Fillers and pauses</b>Estimated from transcription. Frequencies help compare talks of different lengths.</li><li><b>Score</b>A product rubric for selected speech indicators, not overall speaking ability.</li></ul>${btn('Browse reports', 'rep', '', 'gh sm')}`, 'MEASUREMENT GUIDE')}</div>`); };
  B.perf = () => { bindFilters(); if ($('ws-a')) { $('ws-a').onchange = e => { S.compareA = e.target.value; render(); }; $('ws-b').onchange = e => { S.compareB = e.target.value; render(); }; } };
  function goalsPreview() {
    return (S.goals.length ? S.goals.slice(0, 3).map(g => { const r = M.goal(g, S.ses); return `<div class="ws-goal-preview"><b>${esc(g.t)}</b><span>${r.percent}% · ${r.measured ? 'Measured' : 'Self-reported'}</span><progress max="100" value="${r.percent}">${r.percent}%</progress></div>`; }).join('') : '<p>Create a measurable target for your next rehearsal.</p>') + btn('Manage goals', 'goals', '', 'gh sm');
  }
  const signed = (n, key) => n === null ? 'Not enough data' : `${n > 0 ? '+' : ''}${show(n, key)}`;
  function analyticsCards(list) {
    if (!list.length) return '';
    const a = M.analytics(list), s = a.summary;
    const items = [
      ['Latest score', s.score.latest, '%', `${signed(s.score.change)} percentage points vs first attempt`, 'star'],
      ['Average score', s.score.average, '%', `Highest score: ${show(s.score.max)}% across ${s.score.count} scored attempts`, 'prog'],
      ['Latest filler frequency', s.fillerRate.latest, '/min', `${signed(s.fillerRate.change)} /min vs first attempt`, 'fill'],
      ['Pace in reference range', a.paceCount ? a.paceInRange / a.paceCount * 100 : null, '%', `${a.paceInRange} of ${a.paceCount} measured attempts at 100-160 WPM`, 'pace']
    ];
    return `<div class="ws-stats ws-analytics-cards">${items.map(([title, v, unit, detail, glyph]) => `<article class="ws-stat"><span class="dh-icon">${icon(glyph)}</span><h3>${title}</h3><strong>${show(v)} <small>${unit}</small></strong><p>${detail}</p></article>`).join('')}</div>`;
  }
  function metricSummary(list, key) {
    if (!list.length) return '';
    const s = M.analytics(list).summary[key], unit = metrics[key][1];
    const change = s.change === null ? 'Record at least two attempts with this metric to compare changes.' : `${metrics[key][0]} ${s.change === 0 ? 'is unchanged' : s.change > 0 ? 'increased' : 'decreased'} by ${show(Math.abs(s.change), key)} ${key === 'score' ? 'percentage points' : unit} from first to latest attempt.`;
    const guide = { score: 'Score reflects the speech rubric, not overall speaking ability.', wpm: '100-160 WPM is a coaching reference. Faster or slower is not automatically better.', fillerRate: 'Frequency uses fillers per full recording minute, so different lengths can be compared.', pauseRate: 'Pauses can help an audience follow your ideas. Fewer is not always better.', dur: 'Compare duration with your presentation target; shorter is not always better.' }[key];
    return `<div class="ws-metric-summary">${[['First', s.first], ['Latest', s.latest], ['Average', s.average]].map(([label, v]) => `<div><span>${label}</span><b>${show(v, key)} <small>${unit}</small></b></div>`).join('')}</div><p class="ws-insight"><b>${change}</b> ${guide}</p>`;
  }
  function analyticsDetails(list, preview) {
    if (!list.length) return '';
    const a = M.analytics(list), label = preview ? 'SAMPLE ANALYTICS' : 'SELECTED PRACTICE RECORDS';
    const comparisons = Object.entries(metrics).map(([key, [title, unit]]) => {
      const s = a.summary[key], high = Math.max(1, s.first || 0, s.latest || 0);
      return `<article class="ws-delivery-row"><header><h3>${title}</h3><span>${s.change === null ? 'Awaiting comparison' : signed(s.change, key) + ' ' + (key === 'score' ? 'pp' : unit)}</span></header><div class="ws-bars">${[['First', s.first], ['Latest', s.latest]].map(([name, v]) => `<div><span>${name}</span><i aria-hidden="true" style="--bar:${v === null ? 0 : Math.max(0, v) / high * 100}%"></i><b>${show(v, key)}</b></div>`).join('')}</div><small>${unit || 'minutes:seconds'}${key === 'score' ? ' · Change in percentage points' : ''}</small></article>`;
    }).join('');
    const max = Math.max(1, ...a.activity.map(w => w.minutes));
    const dateLabel = n => new Date(n).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const activity = `<div class="ws-activity" role="list" aria-label="Practice minutes in four seven-day periods">${a.activity.map(w => `<div class="ws-activity-col" role="listitem"><b>${show(w.minutes)} <small>min</small></b><div class="ws-activity-track"><span style="height:${w.minutes / max * 100}%"></span></div><strong>${w.count} ${w.count === 1 ? 'attempt' : 'attempts'}</strong><small>${dateLabel(w.start)}<br>${dateLabel(w.end - 1)}</small></div>`).join('')}</div><p class="ws-caption">Last 28 calendar days, including today, in your local timezone. Uses the current selection; attempts without a valid date are excluded.</p>`;
    const latest = list.at(-1), pace = M.value(latest, 'wpm'), fill = M.value(latest, 'fillerRate');
    const focus = pace !== null && (pace < 100 || pace > 160) ? 'Try a short section at a comfortable, steady pace. Use the pace chart to check how it changes.' : fill !== null && fill > 2 ? 'Try replacing a filler with a deliberate pause. Compare filler frequency on your next attempt.' : 'Repeat the same presentation and target length. Check whether your latest delivery is repeatable.';
    return `<div class="ws-grid ws-analytics-detail">${panel('First attempt vs latest', `<p class="ws-caption">Each metric has its own scale. Compare similar presentations and target lengths; these changes are descriptive, not a prediction.</p>${comparisons}`, label)}<div class="ws-analytics-stack">${panel('Your practice rhythm', activity, preview ? 'SAMPLE ACTIVITY' : 'PRACTICE ACTIVITY')}${panel('A focus for your next attempt', `<p>${focus}</p><p class="ws-caption">Based on the latest selected attempt. Pace and filler references are coaching prompts, not universal standards.</p>${btn('Set a practice goal', 'goals', '', 'gh sm')}`, 'FROM NUMBERS TO PRACTICE')}</div></div>`;
  }
  V.prog = () => {
    const preview = previewEnabled(), list = preview ? sampleAttempts() : filtered();
    const key = metrics[S.reviewMetric] ? S.reviewMetric : 'score';
    const goals = preview ? [
      { t: 'Complete 8 rehearsals', metric: 'sessions', target: 8 },
      { t: 'Reach a score of 85%', metric: 'score', target: 85 },
      { t: 'Keep fillers below 2 per minute', metric: 'fillerRate', target: 2 }
    ] : S.goals;
    const goalSessions = preview ? list : S.ses;
    const minutes = Math.round(list.reduce((n, s) => n + (M.value(s, 'dur') || 0), 0) / 60);
    const sampleGoals = goals.map(g => { const r = M.goal(g, list); return `<div class="ws-goal-preview"><b>${esc(g.t)}</b><span>${r.percent}% &middot; Sample progress</span><progress max="100" value="${r.percent}" aria-label="${esc(g.t)}">${r.percent}%</progress></div>`; }).join('');
    const notice = `<section class="ws-filters" aria-label="Progress preview"><div><strong>${preview ? 'Sample preview &middot; fictional practice data' : 'Your practice data'}</strong><p class="ws-caption">${preview ? 'Explore six example attempts without a microphone. These entries are not saved to your account or included in your real goals and reports.' : 'Want to see how progress looks with more attempts? Try the sample preview.'}</p></div><button type="button" class="bt gh sm" id="ws-preview" aria-pressed="${preview}">${preview ? 'Show my progress' : 'Show sample progress'}</button></section>`;
    return wrap(head('SEE YOUR PRACTICE TAKE SHAPE', 'Progress', 'Follow your attempts, habits and goals over time.', btn('Set a goal', 'goals')) + notice + (preview ? '' : filters()) + `<div class="ws-progress-summary"><div><strong>${list.length}</strong><span>${preview ? 'Sample attempts' : 'Analyzed attempts'}</span></div><div><strong>${minutes}<small> min</small></strong><span>${preview ? 'Sample rehearsal time' : 'Time rehearsed'}</span></div><div><strong>${goals.filter(g => M.goal(g, goalSessions).percent >= 100).length}<small> / ${goals.length}</small></strong><span>${preview ? 'Sample goals reached' : 'Account goals reached'}</span></div></div>` + analyticsCards(list) + (!list.length ? baselineCard() : '') + `<div class="ws-grid">${panel(preview ? 'Sample performance progress' : 'Your performance progress', `<div class="chips" role="group" aria-label="Chart metric">${Object.entries(metrics).map(([k, [n]]) => `<button class="chip2" type="button" data-ws-metric="${k}" aria-pressed="${k === key}">${n}</button>`).join('')}</div>${metricSummary(list, key)}${trend(list, key)}`, 'ONE ATTEMPT AT A TIME')}${panel(preview ? 'Sample practice goals' : 'Goals that guide your practice', preview ? sampleGoals : goalsPreview(), preview ? 'EXAMPLE TARGETS' : 'YOUR TARGETS')}</div>` + analyticsDetails(list, preview) + panel(preview ? 'Sample attempts' : 'Recent attempts', table(list.slice(-10).reverse()) + (preview ? '' : `<div class="acts">${btn('Full history & export', 'hist', '', 'gh sm')}</div>`), preview ? 'FICTIONAL PRACTICE RECORD' : 'YOUR PRACTICE RECORD'));
  };
  B.prog = () => {
    if (!previewEnabled()) bindFilters();
    $('ws-preview').onclick = () => { progressPreview = !previewEnabled(); render(); $('ws-preview')?.focus(); };
    document.querySelectorAll('[data-ws-metric]').forEach(b => b.onclick = () => { S.reviewMetric = b.dataset.wsMetric; render(); });
  };
  const historyList = () => M.select(S.ses, { deck: S.compareDeck, days: S.reviewDays, type: S.historyType || 'all', query: S.historyQuery || '', sort: S.historySort || 'newest' });
  for (const view of ['hist', 'rep']) {
    V[view] = () => { const list = historyList(); return wrap(head('YOUR PRACTICE LIBRARY', view === 'hist' ? 'Practice History' : 'Performance Reports', 'Find a session, review its feedback, or export your measurements.', '<button class="bt" type="button" id="ws-export">Export filtered CSV</button>') + filters(true) + panel(`${list.length} saved ${list.length === 1 ? 'session' : 'sessions'}`, `<div class="ws-sort"><label for="ws-sort">Sort by</label><select id="ws-sort">${options([['newest', 'Newest first'], ['oldest', 'Oldest first'], ['score', 'Highest score']], S.historySort || 'newest')}</select></div>${table(list)}<p class="ws-caption">Older entries without a timestamp are included in All time. Legacy scores are preserved for review but excluded from trends.</p>`, 'SESSION LIBRARY')); };
    B[view] = () => { bindFilters(true); $('ws-sort').onchange = e => { S.historySort = e.target.value; render(); }; $('ws-export').onclick = () => { const list = historyList(); if (!list.length) return toast('No matching sessions to export.'); const url = URL.createObjectURL(new Blob([M.csv(list)], { type: 'text/csv;charset=utf-8' })), a = document.createElement('a'); a.href = url; a.download = 'PresentTrack-sessions.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }; };
  }
  // Goal progress uses real analyzed sessions, or an explicitly labelled manual status.
  const goalTypes = [['sessions', 'Number of analyzed rehearsals'], ['score', 'Latest score (at least %)'], ['fillerRate', 'Latest fillers (at most /minute)'], ['manual', 'Personal checklist goal']];
  V.goals = () => wrap(head('PRACTICE WITH PURPOSE', 'Goals', 'Turn a recommendation into a measurable next step.', btn('View progress', 'prog', '', 'gh')) + `<div class="ws-grid">${panel('Create a practice goal', `<form id="ws-goal-form" class="fr"><label for="wg-title">Goal name</label><input id="wg-title" required maxlength="120" placeholder="Rehearse my defense three times"><label for="wg-type">Track with</label><select id="wg-type">${options(goalTypes, 'sessions')}</select><label for="wg-target">Target value</label><input id="wg-target" type="number" min="0.1" max="1000" step="0.1" value="3" required><label for="wg-deck">Presentation</label><select id="wg-deck">${deckOptions('')}</select><label for="wg-due">Target date (optional)</label><input id="wg-due" type="date"><button class="bt" type="submit">Add goal</button></form>`, 'SET YOUR INTENTION')}${panel('Your active goals', S.goals.length ? S.goals.map((g, i) => { const r = M.goal(g, S.ses); return `<article class="ws-goal"><div class="ws-panel-head"><h3>${esc(g.t)}</h3><b>${r.percent}%</b></div><p>${r.measured ? `${esc(goalTypes.find(x => x[0] === g.metric)?.[1] || '')}: ${r.actual === null ? 'Awaiting practice' : show(r.actual)} / target ${g.target}` : 'Self-reported progress'}${g.due ? ` · Due ${esc(g.due)}` : ''}</p><small>${esc(S.pres.find(p => String(p.id) === String(g.deckId))?.t || (g.deckId ? 'Presentation no longer available' : 'All presentations'))}</small><progress max="100" value="${r.percent}">${r.percent}%</progress><div class="acts"><button class="bt gh sm" type="button" data-ws-edit="${i}">Edit</button>${!r.measured ? `<button class="bt gh sm" type="button" data-ws-done="${i}">${r.percent === 100 ? 'Reopen' : 'Mark complete'}</button>` : ''}<button class="bt gh sm" type="button" data-ws-delete="${i}">Delete</button></div></article>`; }).join('') : '<div class="ws-empty"><h3>One small target is enough.</h3><p>Choose a practice count, score, filler frequency, or your own checklist activity.</p></div>', 'TRACK YOUR COMMITMENTS')}</div>`);
  B.goals = () => {
    let editing = null;
    const typeChanged = () => { const type = $('wg-type').value; $('wg-target').disabled = type === 'manual'; $('wg-target').max = type === 'score' ? 100 : 1000; $('wg-target').min = type === 'fillerRate' ? 0 : 1; $('wg-target').step = type === 'sessions' ? 1 : 0.1; };
    typeChanged();
    $('wg-type').onchange = typeChanged;
    $('ws-goal-form').onsubmit = e => { e.preventDefault(); const t = $('wg-title').value.trim(), metric = $('wg-type').value, target = +$('wg-target').value;
      if (!t || (metric !== 'manual' && (!Number.isFinite(target) || target < (metric === 'fillerRate' ? 0 : 1) || target > (metric === 'score' ? 100 : 1000) || (metric === 'sessions' && !Number.isInteger(target))))) return toast('Enter a valid goal and target.');
      const g = { t, metric, target, deckId: $('wg-deck').value, due: $('wg-due').value, p: editing === null ? 0 : S.goals[editing].p || 0 };
      if (editing === null) S.goals.push(g); else S.goals[editing] = g;
      podium.save(); render(); toast('Goal saved.');
    };
    document.querySelectorAll('[data-ws-edit]').forEach(b => b.onclick = () => { editing = +b.dataset.wsEdit; const g = S.goals[editing]; $('wg-title').value = g.t; $('wg-type').value = g.metric || 'manual'; $('wg-target').value = g.target || 3; $('wg-deck').value = g.deckId || ''; $('wg-due').value = g.due || ''; typeChanged(); $('ws-goal-form').querySelector('button').textContent = 'Save goal'; $('wg-title').focus(); });
    document.querySelectorAll('[data-ws-done]').forEach(b => b.onclick = () => { const g = S.goals[+b.dataset.wsDone]; g.p = M.goal(g, S.ses).percent === 100 ? 0 : 100; podium.save(); render(); });
    document.querySelectorAll('[data-ws-delete]').forEach(b => b.onclick = async () => { const g = S.goals[+b.dataset.wsDelete]; if (await confirmDlg({ title: 'Delete this goal?', text: g.t })) { const i = S.goals.indexOf(g); if (i >= 0) S.goals.splice(i, 1); podium.save(); render(); } });
  };
  V.coach = () => { const latest = all().at(-1), f = latest?.analysis?.feedback; return wrap(head('FROM INSIGHT TO ACTION', 'Presentation Coach', 'A focused plan based on your latest analyzed rehearsal.', btn('Start focused practice', pendingEval() ? 'eval' : 'weak', latest?.deckId || '')) + (!latest ? baselineCard() : '') + panel('Your next three steps', practicePlan(latest), latest ? esc(latest.deck) : 'GET STARTED') + `<div class="ws-grid">${panel('Build on your strengths', `<ul class="ws-guide">${(f?.strengths || ['Your strengths will appear after an analyzed rehearsal.']).map(t => `<li>${icon('check')}${esc(t)}</li>`).join('')}</ul>`, 'KEEP DOING')}${panel('Give these areas attention', `<ul class="ws-guide">${(f?.improvements || ['Review one recording to identify a useful practice focus.']).map(t => `<li>${icon('goal')}${esc(t)}</li>`).join('')}</ul>`, 'REFINE NEXT')}</div><p class="ws-caption">These recommendations use measured speech indicators. They do not evaluate idea accuracy, body language, confidence or audience response.</p>`); };
  // Saved setup fields and one preparation calculation across every module.
  V.ready = id => { const p = S.pres.find(x => String(x.id) === String(id)) || S.pres[0]; if (!p) return V.decks(); const r = M.preparation(p, S.ses); return wrap(head('PREPARE FOR THE ROOM', 'Presentation Readiness', esc(p.t), btn('Practice now', 'prac', p.id)) + `<div class="ws-grid">${panel('Your preparation snapshot', `<div class="ws-readiness"><div class="dh-mini-ring" style="--progress:${r.percent}%"><span>${r.percent}%</span></div><div><h3>${r.done} of 6 activities complete</h3><p>${r.count} analyzed rehearsals recorded</p></div></div><ul class="ws-checklist">${r.items.map(([t, done]) => `<li><span class="dh-icon">${done ? '✓' : '○'}</span><span>${t}</span><small>${done ? 'Done' : 'To do'}</small></li>`).join('')}</ul><p class="ws-caption">A preparation checklist, not a prediction of presentation success. Profile and final rehearsal are self-reported.</p>`, 'YOUR CHECKLIST')}${panel('Presentation setup', `<form class="fr" id="ws-ready"><label for="wr-title">Title</label><input id="wr-title" required maxlength="80" value="${esc(p.t)}"><label for="wr-target">Target minutes (recorded analysis supports up to 10)</label><input id="wr-target" type="number" min="1" max="240" required value="${Math.round(p.target / 60)}"><div class="ws-pair"><div><label for="wr-date">Presentation date</label><input id="wr-date" type="date" value="${esc(p.scheduledDate || '')}"></div><div><label for="wr-time">Time</label><input id="wr-time" type="time" value="${esc(p.scheduledTime || '')}"></div></div><label for="wr-notes">Practice focus / preparation notes</label><textarea id="wr-notes" maxlength="1000" rows="3">${esc(p.preparationNotes || '')}</textarea><label><input id="wr-profile" type="checkbox"${p.sp ? ' checked' : ''}> Speaker profile prepared</label><label><input id="wr-final" type="checkbox"${p.final ? ' checked' : ''}> Final rehearsal completed</label><button class="bt" type="submit">Save preparation</button><p class="basis" id="wr-status" role="status"></p></form>`, 'MAKE A PLAN')}</div>`); };
  B.ready = id => { const p = S.pres.find(x => String(x.id) === String(id)) || S.pres[0]; if (!$('ws-ready')) return; $('ws-ready').onsubmit = async e => { e.preventDefault(); if (!$('wr-title').value.trim()) return; const previous = p.short;
    p.t = p.short = $('wr-title').value.trim(); p.target = +$('wr-target').value * 60; p.scheduledDate = $('wr-date').value; p.scheduledTime = $('wr-time').value; p.preparationNotes = $('wr-notes').value.trim(); p.sp = $('wr-profile').checked; p.final = $('wr-final').checked;
    p.left = p.scheduledDate ? M.preparation(p, S.ses).days : null; p.date = p.scheduledDate ? new Date(p.scheduledDate + 'T12:00:00').toLocaleDateString() : 'Not scheduled'; p.time = p.scheduledTime;
    S.ses.forEach(s => { if (String(s.deckId) === String(p.id) || (!s.deckId && s.deck === previous)) s.deck = p.t; });
    podium.save(); render(); toast('Preparation updated.');
  }; };
  V.create = () => pendingEval() ? V.decks() : wrap(head('PREPARE YOUR NEXT TALK', 'New Presentation', 'Create a practice session, with or without slides.') + panel('Presentation details', `<form id="ws-create" class="fr"><label for="wc-title">Presentation title</label><input id="wc-title" required maxlength="80" placeholder="My capstone defense"><label for="wc-target">Target duration (minutes)</label><input id="wc-target" type="number" min="1" max="240" value="5" required><p class="basis">Recorded analysis supports up to 10 minutes per attempt. Choose a short section for longer presentations.</p><button class="bt" type="submit">Create presentation</button><div class="acts">${btn('Upload slides instead', 'up', '', 'gh')}</div></form>`, 'START A DRAFT'));
  B.create = () => { if (!$('ws-create')) return B.decks?.(); $('ws-create').onsubmit = e => { e.preventDefault(); const t = $('wc-title').value.trim(); if (!t) return; const id = S.nid++; S.pres.push({ id, t, short: t, target: +$('wc-target').value * 60, created: new Date().toISOString(), date: 'Not scheduled', time: '', left: null, ppt: false, sp: false, rq: false, final: false }); podium.save(); go('ready', id); }; };
  const practiceToolkit = () => `<section class="dh-tools" data-sec="quick-actions"><header class="dh-section-head"><div><span class="dh-eyebrow">MAKE IT HAPPEN</span><h2>Your practice toolkit</h2></div></header><div class="dh-tool-grid">${[['Upload slides','PDF or PowerPoint','up','up'],['Practice','Record your rehearsal','prac','prac'],['Analyze recording','Review an existing recording','rec','vid'],['Reports','Explore your session feedback','rep','rep'],['Goals','Set your next practice target','goals','goal']].map(([title,detail,view,glyph])=>`<button type="button" data-go="${view}" class="dh-tool"><span class="dh-icon">${icon(glyph)}</span><b>${title}</b><small>${detail}</small><span class="dh-tool-arrow">↗</span></button>`).join('')}</div></section>`;
  const decksView = V.decks, decksBind = B.decks;
  V.decks = () => head('YOUR PRESENTATION LIBRARY', 'My Presentations', 'Prepare your content. Rehearse with purpose.', btn('Create without slides', 'create', '', 'gh')) + practiceToolkit() + decksView().replace(/^<h1[^>]*>.*?<\/h1><p[^>]*>.*?<\/p>/, '') + `<div class="ws-filters"><div><label for="ws-find-deck">Find a presentation</label><input type="search" id="ws-find-deck" placeholder="Search your titles"></div><span class="ws-caption" id="ws-deck-count">${S.pres.length} presentations</span></div>`;
  // Put the library search before the presentation cards, retaining their existing controls.
  const deckSearchView = V.decks;
  V.decks = () => { const html = deckSearchView(), start = html.lastIndexOf('<div class="ws-filters">'), filter = html.slice(start); return html.slice(0, start).replace('<div class="g2">', filter + '<div class="g2">'); };
  B.decks = () => { decksBind?.(); if (!$('ws-find-deck')) return; $('ws-find-deck').oninput = e => { const q = e.target.value.toLowerCase(); let count = 0; document.querySelectorAll('[data-pid]').forEach(card => { const p = S.pres.find(p => String(p.id) === card.dataset.pid); card.hidden = !p?.t.toLowerCase().includes(q); if (!card.hidden) count++; }); $('ws-deck-count').textContent = count + ' matching presentations'; }; };
  V.up = V.decks; B.up = B.decks;
  const report = V.rdet;
  V.rdet = id => { const s = S.ses.find(x => String(x.id) === String(id)) || S.ses.at(-1); if (s?.assess && S.ev) return V.evres(); const dims = podium.measuredReport?.(s?.analysis)?.dims;
    const comments=podium.measuredReport?.(s?.analysis)?.comments;
    const contextReview=comments?panel('Comments on your presentation',`<p>${esc(comments.summary)}</p><div class="ws-pair">${[['What worked',comments.strengths],['What to improve',comments.improvements],['Try in your next rehearsal',comments.recommendations]].map(([title,items])=>`<article><h3>${title}</h3><ul class="tp">${items.map(t=>`<li>${esc(t)}</li>`).join('')}</ul></article>`).join('')}</div><p class="ws-caption">AI comments compare the transcript with extracted slide text. Images, scanned pages and unpracticed sections may be missing. Measured scores above are calculated separately.</p>`,'SLIDES AND DELIVERY'):s?.analysis?panel('Presentation comments',`<p>${s.analysis.contextStatus==='unavailable'?'AI presentation comments were unavailable for this attempt. Your measured delivery results and practice recommendations are saved.':'This attempt has delivery feedback only. Attach a readable PDF to include presentation context in your next rehearsal.'}</p>`,'CONTEXT'):'';
    return report(id) + contextReview + (dims ? panel('How this score was formed', `<div class="ws-compare">${Object.entries(dims).map(([name, d]) => `<article><h3>${esc(name)} · ${d.points} / 2 points</h3><progress value="${d.points}" max="2"></progress><b>${esc(d.label)}</b><p>${esc(d.detail)}</p></article>`).join('')}</div><p class="ws-caption">Rubric version ${esc(s.analysis.criteriaVersion || 'unavailable')}. The practice target was ${fmt(s.tg)}. This report preserves the rubric used for this attempt.</p>`, 'TRANSPARENT SCORING') : ''); };
  const notes = V.note;
  V.note = () => notes() + panel('Keep the practice loop moving', '<div class="acts">' + btn('Review latest report', 'rep', '', 'gh') + btn('Check your goals', 'goals', '', 'gh') + '</div>', 'NEXT STEPS');
  // Keep existing upload/viewer/report controls, applying the common workspace styling.
  for (const key of ['decks', 'up', 'create', 'pdet', 'rec', 'prac', 'weak', 'rdet', 'eval', 'evres', 'note', 'set']) {
    const original = V[key]; if (original) V[key] = arg => `<div class="workspace ws-existing" data-module="${key}">${original(arg)}</div>`;
  }
})();
