/* Only this fixed, non-personal greeting is persisted on the device. */
(() => {
  const text = "Hi there! I'm Tracy, your presentation coach. Welcome to PresentTrack! It's great to have you here. Let's take it one step at a time, starting with a short speaking evaluation.";
  // Bump when the configured voice/model or greeting delivery changes.
  const name = 'presenttrack-greeting-v1', key = '/__tracy_cache__/greeting-v1';
  const ttl = 7 * 24 * 60 * 60 * 1000;
  const valid = value => value?.mime === 'audio/wav' && typeof value.audio === 'string'
    && value.audio.startsWith('UklGR') && value.audio.length < 4000000;
  globalThis.PTGreeting = {
    text,
    async read() {
      try {
        const cache = await globalThis.caches.open(name), response = await cache.match(key);
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
        const cache = await globalThis.caches.open(name);
        // Store audio only: no auth headers, identity, or conversation text.
        await cache.put(key, new Response(JSON.stringify({expires:Date.now()+ttl,
          value:{audio:value.audio,mime:'audio/wav'}}), {headers:{'Content-Type':'application/json'}}));
      } catch { /* Disabled storage or quota must never interrupt speech. */ }
    }
  };
})();
