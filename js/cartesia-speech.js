/* One fixed server-selected voice. Audio stays in memory; no browser-voice fallback. */
(() => {
  let current = null;
  const cache = new Map(); let cacheOwner = null;
  function cancel() {
    const run = current; current = null;
    if (!run) return;
    run.controller.abort(); clearTimeout(run.timer); run.release?.();
    if (run.audio) { run.audio.onended = run.audio.onerror = null; run.audio.pause(); run.audio.removeAttribute('src'); }
    if (run.url) URL.revokeObjectURL(run.url);
  }
  function speak(text, options = {}) {
    cancel();
    const run = current = { controller: new AbortController(), paused: false };
    const active = () => current === run;
    const fail = () => { if (active()) { cancel(); options.onerror?.(); } };
    run.timer = setTimeout(fail, 120000);
    (async () => {
      const cloud = globalThis.PTCloud;
      const { data, error } = await cloud?.client?.auth.getSession() || {};
      if (!active()) return;
      if (error || !data?.session?.access_token) throw new Error('Sign in required');
      const owner = data.session.user.id;
      if (cacheOwner !== owner) { cache.clear(); cacheOwner = owner; }
      const sameOwner = () => active() && globalThis.PTCloud?.user?.id === owner;
      // Split long replies at sentence/word boundaries, keeping one voice throughout.
      const chunks = String(text).match(/.{1,900}(?:\s|$)|\S{1,900}/gs) || [];
      for (const chunk of chunks) {
        if (!sameOwner()) { cancel(); return; }
        const cacheKey = (options.language || 'en-US') + ':' + chunk;
        let value = cache.get(cacheKey);
        if (!value) {
          const response = await fetch('/api/speech', { method: 'POST', cache: 'no-store', signal: run.controller.signal,
            headers: { Authorization: 'Bearer ' + data.session.access_token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: chunk.trim(), language: options.language === 'fil-PH' ? 'tl' : 'en' }) });
          if (!response.ok) throw new Error('Speech unavailable');
          value = await response.json();
          if (value.audio.length < 500000) {
            if (cache.size >= 30) cache.delete(cache.keys().next().value);
            cache.set(cacheKey, value);
          }
        }
        if (!sameOwner()) { cancel(); return; }
        const bytes = Uint8Array.from(atob(value.audio), c => c.charCodeAt(0));
        run.url = URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }));
        run.audio = new Audio(run.url);
        await new Promise((resolve, reject) => {
          run.release = resolve; run.audio.onended = resolve; run.audio.onerror = reject;
          run.audio.onplaying = () => { if (active()) options.onstart?.(); };
          run.reject = reject;
          if (!run.paused) run.audio.play().catch(reject);
        });
        if (!active()) return;
        URL.revokeObjectURL(run.url); run.url = null;
      }
      if (active()) { cancel(); options.onend?.(); }
    })().catch(fail);
    return { cancel: () => { if (active()) cancel(); } };
  }
  function pause(paused) {
    const run = current; if (!run) return;
    run.paused = paused;
    if (paused) run.audio?.pause(); else run.audio?.play().catch(run.reject);
  }
  globalThis.TracyAudio = { speak, cancel, pause };
  addEventListener('pagehide', cancel);
})();
