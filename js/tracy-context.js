/* Read-only app context: displayed name and workspace data, never credentials or file URLs. */
(() => {
  const pages = { library: 'Presentation library', libraryDetail: 'Library presentation', admin: 'Admin Dashboard', dash: 'Dashboard', eval: 'Evaluation', evres: 'Evaluation results', assess: 'Speaker assessment', assres: 'Assessment results', decks: 'My Presentations', pdet: 'Presentation details', create: 'Create presentation', up: 'Upload presentation', ready: 'Presentation readiness', prac: 'Practice', weak: 'Weak-point practice', rec: 'Upload recording', rep: 'Reports', rdet: 'Practice report', perf: 'Performance', prog: 'Progress', hist: 'Practice History', goals: 'Goals', note: 'Notifications', set: 'Settings', coach: 'Presentation coach' };
  const text = (value, max) => typeof value === 'string' ? value.slice(0, max) : '';
  const number = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0 ? Math.min(1000000, Number(value)) : null;
  function result(item) {
    if (!item) return null;
    const unvalidated = item.assess && item.source !== 'recorded-evaluation';
    return { id: String(item.id ?? '').slice(0, 100), title: text(item.deck, 160), date: text(item.at || item.d, 80),
      source: item.assess ? 'evaluation' : item.analysis ? 'recorded-audio' : 'legacy',
      wpm: number(item.wpm), fillers: unvalidated ? null : number(item.fill), pauses: unvalidated ? null : number(item.pau), score: unvalidated ? null : number(item.score),
      durationSeconds: number(item.dur), targetSeconds: number(item.tg),
      feedback: unvalidated ? 'Previous browser-only evaluation: retake required; its score, fillers and pauses are not validated.' : text([item.analysis?.feedback?.summary, ...(item.analysis?.feedback?.improvements || []), ...(item.analysis?.feedback?.recommendations || [])].filter(x => typeof x === 'string').join('\n') || item.analysis?.explanation, 1200) };
  }
  function snapshot() {
    const S = globalThis.podium?.ext?.S;
    if (!S) return {};
    const name = text(S.u?.name?.trim() || globalThis.PTCloud?.user?.user_metadata?.full_name?.trim(), 160);
    const identity = { profile: { displayName: name || null }, page: text(S.view, 80), pageTitle: pages[S.view] || 'PresentTrack', dataStatus: 'ready' };
    // Account loading and the welcome screen must not expose initial demo records.
    if (S.loading || !S.booted) return { ...identity, dataStatus: S.loading ? 'loading' : 'welcome', ...(!S.booted ? { page: 'welcome', pageTitle: 'Welcome' } : {}) };
    const M = globalThis.PTWorkspaceModel;
    const sessions = Array.isArray(S.ses) ? S.ses : [];
    const decks = Array.isArray(S.pres) ? S.pres : [], goals = Array.isArray(S.goals) ? S.goals : [], notes = Array.isArray(S.notes) ? S.notes : [];
    const report = S.view === 'rdet' ? sessions.find(s => String(s.id) === String(S.arg)) : null;
    const review = ['perf', 'prog', 'hist', 'rep'].includes(S.view);
    const deckId = report?.deckId || (['pdet', 'prac', 'weak'].includes(S.view) ? document.getElementById('pd')?.value || S.arg : S.view === 'rec' ? document.getElementById('rs')?.value : review ? S.compareDeck : null);
    const presentation = deckId ? (S.pres || []).find(p => String(p.id) === String(deckId)) : null;
    const selected = M ? M.select(sessions, { deck: deckId || '', days: review ? S.reviewDays || 0 : 0, type: S.view === 'hist' ? S.historyType || 'all' : 'analyzed', query: S.view === 'hist' ? S.historyQuery || '' : '' }) : [];
    const base = M?.baseline(S.ev), candidates = [...(base ? [base] : []), ...selected];
    const comparison = S.view === 'perf' && candidates.length >= 2 ? [candidates.find(s => String(s.id) === String(S.compareA)) || candidates[0], candidates.find(s => String(s.id) === String(S.compareB)) || candidates.at(-1)] : [];
    const context = { ...identity, metric: text((review ? S.reviewMetric : S.metric) || '', 80),
      workspace: { presentationCount: decks.length, totalSessionCount: sessions.length, analyzedPracticeCount: sessions.filter(s => !s.assess && !!s.analysis).length,
        goalCount: goals.length, unreadNotificationCount: notes.filter(n => !n.r).length,
        evaluationComplete: globalThis.PTCloud?.enabled ? !!globalThis.PTCloud.assessmentDone : !!S.ev?.done,
        recordingActive: !!globalThis.PTPracticeAudio?.capturing },
      presentations: decks.slice(0, 10).map(p => ({ id: String(p.id ?? '').slice(0, 100), title: text(p.t, 160), targetSeconds: number(p.target), scheduledDate: text(p.scheduledDate || (p.left != null ? p.date : ''), 80), hasSlideText: !!p.context?.text })),
      goals: goals.slice(0, 5).map(g => { const progress = M?.goal(g, sessions); return { title: text(g.t, 200), metric: text(g.metric || 'manual', 80), target: number(g.target), progressPercent: number(progress?.percent), measured: !!progress?.measured }; }),
      notifications: notes.slice(0, 3).map(n => ({ title: text(n.t, 160), detail: text(n.s, 300), read: !!n.r })),
      presentation: presentation ? { title: text(presentation.t, 160), text: text(presentation.context?.text, 8000), truncated: (presentation.context?.text?.length || 0) > 8000 } : null,
      results: (report ? [report] : selected.slice(-4)).map(result), comparison: comparison.map(result),
      baseline: result(base), filters: { deck: String(deckId || '').slice(0, 100), days: review ? Math.max(0, Math.min(36500, Number(S.reviewDays) || 0)) : 0 } };
    // Keep the full bounded inventory and measurements; trim verbose text to the API budget.
    const verbose = [...context.results, ...context.comparison, ...(context.baseline ? [context.baseline] : [])].map(item => [item, 'feedback']);
    if (context.presentation) verbose.push([context.presentation, 'text']);
    for (const [item, key] of verbose) {
      const excess = JSON.stringify(context).length - 19000;
      if (excess <= 0) break;
      const length = item[key].length;
      item[key] = item[key].slice(0, Math.max(0, length - excess));
      if (key === 'text' && item[key].length < length) item.truncated = true;
    }
    return context;
  }
  globalThis.TracyContext = { snapshot };
})();
