# Cache behavior

- Production builds fingerprint the scripts and styles referenced in HTML, including the embedded robot model. Vercel serves these immutable versions with a one-year browser cache lifetime. HTML revalidates, so a deployment references new filenames when content changes. Original paths remain available for runtime imports.
- Configuration revalidates. API responses use private/no-store headers. No service worker intercepts authentication, uploads, or account data.
- `js/greeting-cache.js` persists only the fixed, non-personal greeting audio for seven days. It stores no credentials, account identifiers, or conversation transcripts. Authenticated playback is still required. Cached speech is reusable across page reloads; unavailable storage, expiry, and corrupt entries fall back to the existing speech endpoint.
- Other speech remains in the existing bounded in-memory cache and private server cache. Duplicate in-flight speech requests are already coalesced.

When changing the configured Cartesia voice/model or greeting delivery, bump the greeting cache version in `greeting-cache.js`. Wording changes must also bump it. Deploy the build and `vercel.json` together to activate static cache headers. Local development intentionally continues using unversioned files.

Caching speeds up repeat visits and repeated greetings. First-time synthesis, new AI answers, recording analysis, and network/authentication requests can still take time. Browser storage eviction can also cause a new cache miss.

Validation: 135 application tests passed; production build succeeded; generated asset fingerprints and referenced files checked. Live Vercel response headers and real audio latency require deployment verification.
