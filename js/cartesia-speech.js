/* Prefer the server-selected voice; report a device-voice fallback explicitly.
   Only fixed welcome clips persist locally. */
(() => {
  let current = null;
  let loginAudio = null, unlocking = null;
  const speechError = (code, extra = {}) => Object.assign(new Error(code), { code, ...extra });
  // Prime the same media element inside the user's login gesture. No speech or
  // provider request occurs until authentication has completed.
  function unlock() {
    if (current || unlocking) return unlocking || Promise.resolve(false);
    loginAudio ||= new Audio();
    loginAudio.setAttribute?.('playsinline', '');
    loginAudio.src = 'data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQIAAAAAAA==';
    let attempt;
    try { attempt = Promise.resolve(loginAudio.play()).then(() => true, () => false); }
    catch { attempt = Promise.resolve(false); }
    unlocking = attempt;
    attempt.finally(() => { if (unlocking === attempt) unlocking = null; });
    return attempt;
  }
  const cache = new Map(); let cacheOwner = null, unavailable = null;
  const pending = new Map();
  async function load(text, language = 'en-US') {
    const cloud = globalThis.PTCloud;
    const { data, error } = await cloud?.client?.auth.getSession() || {};
    if (error || !data?.session?.access_token || cloud?.user?.id !== data.session.user.id) throw speechError('unauthorized');
    const owner = data.session.user.id;
    if (cacheOwner !== owner) { cache.clear(); unavailable = null; cacheOwner = owner; }
    const key = owner + ':' + language + ':' + text.trim();
    if (cache.has(key)) return cache.get(key);
    if (pending.has(key)) return pending.get(key);
    const task = (async () => {
      // Exact allowlist: dynamic tours and conversations never enter device storage.
      const persistentClip = language === 'en-US' && [globalThis.PTGreeting, globalThis.PTWelcomeDoorSpeech, globalThis.PTReturningGreeting]
        .find(clip => clip && text.trim() === clip.text);
      if (persistentClip) {
        const saved = await persistentClip.read();
        if (globalThis.PTCloud?.user?.id !== owner) throw speechError('unauthorized');
        if (saved) { cache.set(key, saved); return saved; }
      }
      if (unavailable?.owner === owner && unavailable.until > Date.now()) throw unavailable.error;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 40000);
      try {
        const response = await fetch('/api/speech', { method: 'POST', cache: 'no-store', signal: controller.signal,
          headers: { Authorization: 'Bearer ' + data.session.access_token, 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: text.trim(), language: language === 'fil-PH' ? 'tl' : 'en' }) });
        const value = await response.json().catch(() => ({}));
        if (globalThis.PTCloud?.user?.id !== owner) throw speechError('unauthorized');
        if (!response.ok) {
          const code = response.status === 401 ? 'unauthorized' : typeof value.error === 'string' ? value.error : 'speech_unavailable';
          const retryAt = Date.now() + Math.max(5, Math.min(120, Number(response.headers.get('Retry-After')) || 60)) * 1000;
          const failure = speechError(code, { retryAt });
          if (['speech_credits', 'speech_limit', 'speech_busy'].includes(code)) unavailable = { owner, error: failure, until: retryAt };
          throw failure;
        }
        if (typeof value.audio !== 'string' || !value.audio || value.audio.length > 4000000) throw speechError('invalid_audio');
        if (persistentClip) void persistentClip.write(value);
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
    if (run.utterance) {
      run.utterance.onend = run.utterance.onerror = run.utterance.onstart = null;
      globalThis.speechSynthesis?.cancel(); run.utterance = null;
    }
    if (run.audio) { run.audio.onended = run.audio.onerror = run.audio.onplaying = run.audio.onpause = run.audio.onwaiting = null; run.audio.pause(); run.audio.removeAttribute('src'); }
    if (run.url) URL.revokeObjectURL(run.url);
  }
  function speak(text, options = {}) {
    cancel();
    if (globalThis.navigator?.userActivation?.isActive) void unlock();
    const run = current = { controller: new AbortController(), paused: false };
    const active = () => current === run;
    const fail = error => { if (active()) { cancel(); options.onerror?.(error?.code ? error : speechError('speech_unavailable')); } };
    const arm = () => { clearTimeout(run.timer); run.timer = setTimeout(() => fail(speechError('speech_timeout')), 120000); };
    const blocked = () => { clearTimeout(run.timer); run.blocked = true; options.onerror?.(speechError('playback_blocked')); };
    const started = (source, reason) => {
      options.onstart?.({ source, reason });
      if (globalThis.CustomEvent && globalThis.dispatchEvent) globalThis.dispatchEvent(new CustomEvent('tracy-audio-source', { detail: { source } }));
    };
    arm();
    const chunks = String(text).match(/.{1,900}(?:\s|$)|\S{1,900}/gs) || [];
    let chunkIndex = 0;
    function deviceVoice(reason) {
      const synth = globalThis.speechSynthesis, Utterance = globalThis.SpeechSynthesisUtterance;
      if (!synth || !Utterance) { fail(speechError('device_voice_unavailable', { cause: reason.code })); return; }
      options.onfallback?.({ source: 'device', reason: reason.code || 'speech_unavailable' });
      function play() {
        if (!active() || globalThis.PTCloud?.user?.id !== run.owner) { if (active()) cancel(); return; }
        const u = run.utterance = new Utterance(chunks.slice(chunkIndex).join(' '));
        u.lang = options.language || 'en-US';
        globalThis.TracySpeech?.configure(u, synth, u.lang);
        const isCurrent = () => active() && run.utterance === u;
        u.onstart = () => { if (isCurrent()) { run.blocked = false; started('device', reason.code); } };
        u.onend = () => { if (isCurrent()) { run.utterance = null; cancel(); options.onend?.(); } };
        u.onerror = event => {
          if (!isCurrent()) return;
          run.utterance = null;
          if (event.error === 'not-allowed') blocked();
          else fail(speechError('device_voice_unavailable', { cause: reason.code }));
        };
        arm();
        try { synth.resume?.(); synth.speak(u); } catch { u.onerror({ error: 'not-allowed' }); }
      }
      run.retry = play; play();
    }
    (async () => {
      if (unlocking) await unlocking;
      if (!active()) return;
      const cloud = globalThis.PTCloud;
      const { data, error } = await cloud?.client?.auth.getSession() || {};
      if (!active()) return;
      if (error || !data?.session?.access_token || cloud?.user?.id !== data.session.user.id) throw speechError('unauthorized');
      const owner = run.owner = data.session.user.id;
      if (cacheOwner !== owner) { cache.clear(); unavailable = null; cacheOwner = owner; }
      const sameOwner = () => active() && globalThis.PTCloud?.user?.id === owner;
      // Split long replies at sentence/word boundaries, keeping one voice throughout.
      for (; chunkIndex < chunks.length; chunkIndex++) {
        if (!sameOwner()) { cancel(); return; }
        const value = await load(chunks[chunkIndex], options.language);
        if (!sameOwner()) { cancel(); return; }
        const bytes = Uint8Array.from(atob(value.audio), c => c.charCodeAt(0));
        run.url = URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }));
        run.audio = loginAudio ||= new Audio();
        run.audio.setAttribute?.('playsinline', ''); run.audio.src = run.url;
        await new Promise((resolve, reject) => {
          run.release = resolve; run.audio.onended = () => { if (active()) options.onpause?.(); resolve(); }; run.audio.onerror = () => reject(speechError('invalid_audio'));
          run.audio.onplaying = () => { if (active()) { run.blocked = false; started('natural'); } };
          run.audio.onpause = run.audio.onwaiting = () => { if (active()) options.onpause?.(); };
          run.reject = reject;
          const handleError = error => { if (!active()) return; if (error?.name === 'NotAllowedError') blocked(); else reject(speechError('invalid_audio')); };
          run.retry = () => {
            if (!sameOwner()) { cancel(); return; }
            arm();
            try { Promise.resolve(run.audio.play()).catch(handleError); } catch (error) { handleError(error); }
          };
          if (!run.paused) run.retry();
        });
        if (!active()) return;
        URL.revokeObjectURL(run.url); run.url = null;
      }
      if (active()) { cancel(); options.onend?.(); }
    })().catch(error => {
      if (!active()) return;
      if (!run.owner || globalThis.PTCloud?.user?.id !== run.owner || error?.code === 'unauthorized') { fail(speechError('unauthorized')); return; }
      if (run.audio) { run.audio.onended = run.audio.onerror = run.audio.onplaying = run.audio.onpause = run.audio.onwaiting = null; run.audio.pause(); }
      if (run.url) { URL.revokeObjectURL(run.url); run.url = null; }
      if (options.allowDeviceFallback === false) { fail(error); return; }
      deviceVoice(error);
    });
    return { cancel: () => { if (active()) cancel(); }, retry: () => { if (!active() || !run.blocked || !run.retry) return false; run.blocked = false; run.retry(); return true; } };
  }
  function pause(paused) {
    const run = current; if (!run) return;
    run.paused = paused;
    if (run.utterance) { if (paused) globalThis.speechSynthesis?.pause(); else globalThis.speechSynthesis?.resume(); }
    else if (paused) run.audio?.pause(); else if (run.audio) run.retry?.();
  }
  globalThis.TracyAudio = { speak, cancel, pause, prepare, unlock };
  addEventListener('pagehide', cancel);
})();
