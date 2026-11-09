/* Deliberately selected app data only; no credentials, file URLs or profile data. */
(() => {
  const text = (value, max) => typeof value === 'string' ? value.slice(0, max) : '';
  const number = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0 ? Math.min(1000000, Number(value)) : null;
  function result(item) {
    if (!item) return null;
    return { id: String(item.id ?? '').slice(0, 100), title: text(item.deck, 160), date: text(item.at || item.d, 80),
      source: item.assess ? 'evaluation' : item.analysis ? 'recorded-audio' : 'legacy',
      wpm: number(item.wpm), fillers: number(item.fill), pauses: number(item.pau), score: number(item.score),
      durationSeconds: number(item.dur), targetSeconds: number(item.tg),
      feedback: text([item.analysis?.feedback?.summary, ...(item.analysis?.feedback?.improvements || []), ...(item.analysis?.feedback?.recommendations || [])].filter(x => typeof x === 'string').join('\n') || item.analysis?.explanation, 1200) };
  }
  function snapshot() {
    const S = globalThis.podium?.ext?.S;
    if (!S || S.loading || !S.booted) return {};
    const M = globalThis.PTWorkspaceModel;
    const sessions = Array.isArray(S.ses) ? S.ses : [];
    const report = S.view === 'rdet' ? sessions.find(s => String(s.id) === String(S.arg)) : null;
    const review = ['perf', 'prog', 'hist', 'rep'].includes(S.view);
    const deckId = report?.deckId || (['pdet', 'prac', 'weak'].includes(S.view) ? document.getElementById('pd')?.value || S.arg : S.view === 'rec' ? document.getElementById('rs')?.value : review ? S.compareDeck : null);
    const presentation = deckId ? (S.pres || []).find(p => String(p.id) === String(deckId)) : null;
    const selected = M ? M.select(sessions, { deck: deckId || '', days: review ? S.reviewDays || 0 : 0, type: S.view === 'hist' ? S.historyType || 'all' : 'analyzed', query: S.view === 'hist' ? S.historyQuery || '' : '' }) : [];
    const base = M?.baseline(S.ev), candidates = [...(base ? [base] : []), ...selected];
    const comparison = S.view === 'perf' && candidates.length >= 2 ? [candidates.find(s => String(s.id) === String(S.compareA)) || candidates[0], candidates.find(s => String(s.id) === String(S.compareB)) || candidates.at(-1)] : [];
    return { page: text(S.view, 80), metric: text((review ? S.reviewMetric : S.metric) || '', 80),
      presentation: presentation ? { title: text(presentation.t, 160), text: text(presentation.context?.text, 8000), truncated: (presentation.context?.text?.length || 0) > 8000 } : null,
      results: (report ? [report] : selected.slice(-4)).map(result), comparison: comparison.map(result),
      baseline: result(base), filters: { deck: String(deckId || '').slice(0, 100), days: review ? Math.max(0, Math.min(36500, Number(S.reviewDays) || 0)) : 0 } };
  }
  globalThis.TracyContext = { snapshot };
})();
