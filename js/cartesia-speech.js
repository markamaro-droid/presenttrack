/* One fixed server-selected voice. Audio stays in memory; no browser-voice fallback. */
(() => {
  let current = null;
  const cache = new Map(); let cacheOwner = null;
  const pending = new Map();
  async function load(text, language = 'en-US') {
    const cloud = globalThis.PTCloud;
    const { data, error } = await cloud?.client?.auth.getSession() || {};
    if (error || !data?.session?.access_token || cloud?.user?.id !== data.session.user.id) throw new Error('Sign in required');
    const owner = data.session.user.id;
    if (cacheOwner !== owner) { cache.clear(); cacheOwner = owner; }
    const key = owner + ':' + language + ':' + text.trim();
    if (cache.has(key)) return cache.get(key);
    if (pending.has(key)) return pending.get(key);
    const task = (async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 40000);
      try {
        const response = await fetch('/api/speech', { method: 'POST', cache: 'no-store', signal: controller.signal,
          headers: { Authorization: 'Bearer ' + data.session.access_token, 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: text.trim(), language: language === 'fil-PH' ? 'tl' : 'en' }) });
        if (!response.ok) throw new Error('Speech unavailable');
        const value = await response.json();
        if (globalThis.PTCloud?.user?.id !== owner) throw new Error('Account changed');
        // Tour clips are often larger than the old 500 KB ceiling. Bound total
        // encoded audio instead, so ordinary narration is actually reused.
        if (value.audio.length <= 4000000) {
          while (cache.size && (cache.size >= 30 || [...cache.values()].reduce((n, v) => n + v.audio.length, 0) + value.audio.length > 16000000)) cache.delete(cache.keys().next().value);
          cache.set(key, value);
        }
        return value;
      } finally { clearTimeout(timeout); }
    })();
    pending.set(key, task);
    try { return await task; } finally { pending.delete(key); }
  }
  // Prepare only the next clip. This never plays audio or opens the microphone.
  function prepare(text, language = 'en-US') {
    const first = String(text).match(/.{1,900}(?:\s|$)|\S{1,900}/gs)?.[0];
    return first ? load(first, language).then(() => true, () => false) : Promise.resolve(false);
  }
  function cancel() {
    const run = current; current = null;
    if (!run) return;
    run.controller.abort(); clearTimeout(run.timer); run.release?.();
    if (run.audio) { run.audio.onended = run.audio.onerror = run.audio.onplaying = run.audio.onpause = run.audio.onwaiting = null; run.audio.pause(); run.audio.removeAttribute('src'); }
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
        const value = await load(chunk, options.language);
        if (!sameOwner()) { cancel(); return; }
        const bytes = Uint8Array.from(atob(value.audio), c => c.charCodeAt(0));
        run.url = URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }));
        run.audio = new Audio(run.url);
        await new Promise((resolve, reject) => {
          run.release = resolve; run.audio.onended = () => { if (active()) options.onpause?.(); resolve(); }; run.audio.onerror = reject;
          run.audio.onplaying = () => { if (active()) options.onstart?.(); };
          run.audio.onpause = run.audio.onwaiting = () => { if (active()) options.onpause?.(); };
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
  globalThis.TracyAudio = { speak, cancel, pause, prepare };
  addEventListener('pagehide', cancel);
})();
