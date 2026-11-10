/* Pure account-data helpers shared by the workspace views and their tests. */
(() => {
  const numeric = v => v !== null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null;
  const clamp = n => Math.max(0, Math.min(100, n));
  const date = s => s.at && Number.isFinite(Date.parse(s.at)) ? Date.parse(s.at) : null;
  const matches = (s, id) => !id || String(s.deckId) === String(id);
  const analyzed = s => !s.assess && !!s.analysis;
  function select(sessions, { deck = '', days = 0, query = '', type = 'analyzed', sort = 'oldest' } = {}, now = Date.now()) {
    return sessions.map((s, i) => ({ s, i })).filter(({ s }) =>
      matches(s, deck) && (type === 'all' || (type === 'evaluation' ? s.assess : type === 'legacy' ? !s.assess && !s.analysis : analyzed(s))) &&
      (!days || (date(s) !== null && date(s) >= now - Number(days) * 86400000 && date(s) <= now)) &&
      `${s.deck || ''} ${s.d || ''}`.toLowerCase().includes(query.toLowerCase())
    ).sort((a, b) => {
      if (sort === 'score') return (numeric(b.s.score) ?? -1) - (numeric(a.s.score) ?? -1);
      const order = date(a.s) !== null && date(b.s) !== null ? date(a.s) - date(b.s) : a.i - b.i;
      return sort === 'newest' ? -order : order;
    }).map(x => x.s);
  }
  function value(s, key) {
    if (!s) return null;
    if (s.assess && s.source !== 'recorded-evaluation' && ['score', 'fill', 'pau', 'fillerRate', 'pauseRate'].includes(key)) return null;
    if (key === 'fillerRate' || key === 'pauseRate') {
      const n = numeric(s[key === 'fillerRate' ? 'fill' : 'pau']);
      return n !== null && s.dur > 0 ? n * 60 / s.dur : null;
    }
    if (key === 'timing') return s.tg > 0 && numeric(s.dur) !== null ? (s.dur - s.tg) / s.tg * 100 : null;
    return numeric(s[key]);
  }
  function baseline(ev) {
    if (ev?.results?.source !== 'recorded-evaluation' || ev.results.contentValidation?.eligible !== true) return null;
    const m = ev?.results?.metrics;
    if (!m) return null;
    return { id: 'baseline', deck: 'Pre-evaluation', assess: true, source: 'recorded-evaluation', at: ev.results.completedAt || ev.at,
      dur: numeric(m.totalDurationSec), wpm: m.totalDurationSec > 0 ? Math.round(m.words * 60 / m.totalDurationSec) : numeric(m.wpm),
      fill: numeric(m.fillerCount), pau: numeric(m.pauseCount), score: null, tg: null };
  }
  function goal(g, sessions) {
    const list = select(sessions, { deck: g.deckId }), latest = list.at(-1);
    if (!g.metric || g.metric === 'manual') return { percent: clamp(numeric(g.p) || 0), actual: null, measured: false };
    const actual = g.metric === 'sessions' ? list.length : value(latest, g.metric);
    const validTarget = Number.isFinite(Number(g.target)) && (g.metric === 'fillerRate' ? g.target >= 0 : g.target > 0);
    if (actual === null || !validTarget) return { percent: 0, actual, measured: true };
    const percent = g.metric === 'fillerRate' ? (actual <= g.target ? 100 : g.target / actual * 100) : actual / g.target * 100;
    return { percent: Math.round(clamp(percent)), actual, measured: true };
  }
  function preparation(p, sessions, now = Date.now()) {
    const today = new Date(now); today.setHours(0, 0, 0, 0);
    const count = select(sessions, { deck: p.id }).length;
    const items = [ ['Presentation scheduled', !!(p.scheduledDate || p.left != null)], ['Slides uploaded', !!p.ppt],
      ['Speaker profile prepared', !!p.sp], ['Recording quality checked', !!p.rq],
      ['Three analyzed rehearsals', count >= 3], ['Final rehearsal completed', !!p.final] ];
    const done = items.filter(x => x[1]).length;
    return { items, done, percent: Math.round(done / items.length * 100), count,
      days: p.scheduledDate ? Math.round((new Date(p.scheduledDate + 'T00:00:00').getTime() - today.getTime()) / 86400000) : p.left };
  }
  function csv(sessions) {
    const cell = v => '"' + String(v ?? '').replace(/^[=+@\-\t\r]/, "'$&").replaceAll('"', '""') + '"';
    const rows = [['Presentation', 'Recorded at', 'Source', 'Duration seconds', 'Target seconds', 'WPM', 'Fillers', 'Long pauses', 'Score'],
      ...sessions.map(s => [s.deck, s.at || s.d, s.assess ? s.source === 'recorded-evaluation' ? 'Recorded evaluation' : 'Evaluation / retake required' : s.analysis ? 'Recorded audio' : 'Legacy / unverified', s.dur, s.tg, s.wpm, value(s, 'fill'), value(s, 'pau'), value(s, 'score')])];
    return '\uFEFF' + rows.map(row => row.map(cell).join(',')).join('\r\n');
  }
  function analytics(sessions, now = Date.now()) {
    const list = select(sessions);
    const summary = {};
    for (const key of ['score', 'wpm', 'fillerRate', 'pauseRate', 'dur']) {
      const values = list.map(s => value(s, key)).filter(v => v !== null);
      const first = value(list[0], key), latest = value(list.at(-1), key);
      summary[key] = { first, latest, count: values.length,
        average: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null,
        min: values.length ? Math.min(...values) : null, max: values.length ? Math.max(...values) : null,
        change: list.length > 1 && first !== null && latest !== null ? latest - first : null };
    }
    // Calendar-day buckets in the viewer's timezone; unknown dates are not invented.
    const today = new Date(now); today.setHours(0, 0, 0, 0);
    const activity = Array.from({ length: 4 }, (_, i) => {
      const start = new Date(today), end = new Date(today);
      start.setDate(start.getDate() - 27 + i * 7); end.setDate(end.getDate() - 20 + i * 7);
      const matches = list.filter(s => date(s) !== null && date(s) >= +start && date(s) < +end && date(s) <= now);
      return { start: +start, end: +end, count: matches.length,
        minutes: matches.reduce((n, s) => n + Math.max(0, value(s, 'dur') || 0), 0) / 60 };
    });
    const paced = list.filter(s => value(s, 'wpm') !== null);
    return { summary, activity, count: list.length,
      paceCount: paced.length, paceInRange: paced.filter(s => s.wpm >= 100 && s.wpm <= 160).length };
  }
  globalThis.PTWorkspaceModel = { select, value, baseline, goal, preparation, csv, date, analytics };
})();
