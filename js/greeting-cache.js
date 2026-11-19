/* Only these fixed, non-personal welcome clips persist on the device. */
(() => {
  const ttl = 7 * 24 * 60 * 60 * 1000;
  const valid = value => value?.mime === 'audio/wav' && typeof value.audio === 'string'
    && value.audio.startsWith('UklGR') && value.audio.length < 4000000;
  // Bump each version when its text, configured voice/model, or delivery changes.
  const clip = (id, text) => ({
    text,
    async read() {
      try {
        const cache = await globalThis.caches.open('presenttrack-' + id), key = '/__tracy_cache__/' + id;
        const response = await cache.match(key);
        if (!response) return null;
        const saved = await response.json();
        if (!Number.isFinite(saved.expires) || saved.expires <= Date.now() || !valid(saved.value)) {
          await cache.delete(key); return null;
        }
        return saved.value;
      } catch { return null; }
    },
    async write(value) {
      if (!valid(value)) return;
      try {
        const cache = await globalThis.caches.open('presenttrack-' + id);
        // Store audio only: no auth headers, identity, or conversation text.
        await cache.put('/__tracy_cache__/' + id, new Response(JSON.stringify({expires:Date.now()+ttl,
          value:{audio:value.audio,mime:'audio/wav'}}), {headers:{'Content-Type':'application/json'}}));
      } catch { /* Disabled storage or quota must never interrupt speech. */ }
    }
  });
  globalThis.PTGreeting = clip('greeting-v1', "Hi there! I'm Tracy, your presentation coach. Welcome to PresentTrack! It's great to have you here. Let's take it one step at a time, starting with a short speaking evaluation.");
  globalThis.PTWelcomeDoorSpeech = clip('welcome-door-v1', "Let's dive into your speaking evaluation. Follow me inside, and we'll take it one step at a time.");
  globalThis.PTReturningGreeting = clip('returning-greeting-v1', "Welcome back! Let's pick up where you left off. Your dashboard is ready.");
})();
