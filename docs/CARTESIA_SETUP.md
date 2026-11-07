# Tracy voice

Tracy's intro, guide and conversation replies use `/api/speech`, authenticated by Supabase. The server pins the voice ID and model; clients cannot select other voices. Text replies still use the existing AI providers. Cartesia receives only the text to speak, not microphone audio.

1. Run `supabase/migrations/20261107_tracy_speech.sql` after the existing Tracy voice migration, then run `supabase/migrations/20261108_tracy_speech_cache.sql`.
2. Set `CARTESIA_API_KEY`, `CARTESIA_VOICE_ID`, and `CARTESIA_MODEL` in Vercel Production (and Preview if used). Recommended model: `sonic-3.6-2026-08-27`.
3. Deploy these code changes. Restart `npm run dev` for local testing.

Limits: 1,000 characters per request; 12 generations/minute and 120/day per account, 2,000/day site-wide. The SQL function checks and reserves usage atomically; failed provider calls also consume a reservation. These are request caps, not a guaranteed monetary budget. Change the SQL caps to match your Cartesia plan. Missing migration fails closed before paid synthesis.

Generated clips are saved in the private `tracy-speech-cache` Supabase Storage bucket, in account-specific folders with SHA-256 filenames (no text in filenames). Cache identity includes text, language, voice, model, output format and cache/API version. Hits are served before the generation quota and Cartesia call, so replays do not spend Cartesia credits. A changed voice/model/text generates a new clip. Personalized replies are never shared between accounts. Microphone recordings are not cached.

Browser and warm-server memory caches remain as fast first layers. Concurrent identical requests within one server instance share a generation; simultaneous cold instances may still generate the same missing clip twice. Upload conflicts preserve the existing clip. Cache reads fail closed on storage errors to avoid repeated charges. If saving an already-generated clip fails, the response still supplies the audio with `cachedPermanently: false`; memory reuse remains available, but future cold starts may regenerate it.

No additional API keys are needed. Storage uses the signed-in user's JWT and RLS policies following https://supabase.com/docs/guides/storage/security/access-control. Apply the bucket migration before deploying. This retains generated speech (which can include personal reply content) until the site owner removes it through Storage; no automatic retention job is installed. Storage/egress still count against your Supabase plan. Account deletion should include Storage cleanup. Previously generated memory-only clips are not backfilled.

Audio failure never silently changes Tracy to a browser voice. Intro/tour text remains visible; conversation replies remain readable with retry and Interrupt controls. Browsers can require a click before audio playback. Mute, tour pause, interruption and page exit stop/pause audio as appropriate.

Official references: https://docs.cartesia.ai/api-reference/tts/bytes and https://github.com/cartesia-ai/cartesia-js (API version `2026-08-14`).
