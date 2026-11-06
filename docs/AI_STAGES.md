# Presentation AI implementation stages

## Status

Stage 1 foundation is implemented and unit-tested: server task routing, Zod schemas, deterministic speech metrics, audio preprocessing/chunking, shared speech service, and a real-provider comparison CLI. **It is not yet connected to the live assessment or practice flow.** Existing Tracy, assessment and upload behavior remains unchanged. The production assessment still uses its existing Supabase Edge Function, not these Node modules.

The repository is plain HTML/browser JavaScript, Node ESM Vercel routes and Supabase TypeScript Edge Functions. There is no `lib/llm.ts`, Next.js app or TypeScript build. New server modules follow the existing `.mjs` style. FFmpeg is a worker/local executable requirement, not something assumed to exist in a Vercel or Deno function.

## Files

- `server/tasks/router.mjs`: task-specific provider order, configurable models, bounded outputs, timeouts, fallback, provider provenance, consent/identity precondition, paid-call admission hook, cache hook and metadata-only telemetry.
- `server/tasks/schemas.mjs`: Zod schemas for analysis, proofreading proposals, layout flags, transcription and verbatim output.
- `server/tasks/audio.mjs`: FFmpeg conversion to 16 kHz mono PCM WAV, amplitude-based edge trim with 250 ms padding and retained offset, 60-second chunks. Internal silence is preserved. This is not a trained voice activity detector.
- `server/tasks/speech-metrics.mjs`: strict `gap > threshold` pause measurements, overall WPM, repetition counts, confirmed hesitation-token counts, separate ambiguous-token counts, configurable deterministic scoring, normalized word error rate.
- `server/tasks/speech.mjs`: shared evaluation service and bounded analysis; timing provenance stays separate from main transcript. Only compact metrics and transcript chunks reach analysis providers. No raw word arrays are sent for analysis.
- `tools/compare-transcription.mjs`: opt-in comparison on user-supplied, labelled recordings; logs WER, counts, provider/model, duration and token metadata, never transcripts or raw error bodies.
- `tests/task-routing.test.mjs`, `tests/speech-pipeline.test.mjs`: mocked routing/budget/cache isolation, schema failures, safe fallback, silence preservation, pause/filler/scoring behavior.

## Verified provider constraints and defaults

Documentation reviewed during this implementation:

- [OpenAI file transcription](https://developers.openai.com/api/docs/guides/speech-to-text): `gpt-4o-transcribe` does not support `timestamp_granularities`; the documented word-timestamp parameter is for `whisper-1`. Keep requested main model, request JSON text only. Use Groq timing pass when required. Never attach Groq word timestamps to different OpenAI words as though they are aligned.
- [Groq speech-to-text](https://console.groq.com/docs/speech-to-text): `whisper-large-v3` supports verbose JSON and word timing. Existing Groq text model is `openai/gpt-oss-20b` ([models](https://console.groq.com/docs/models)).
- [DeepSeek first API call](https://api-docs.deepseek.com/): current documented model `deepseek-flash`, chat-completions compatible endpoint. This application restricts it to text regardless of any other provider capabilities.
- [Google supported models](https://firebase.google.com/docs/ai-logic/models): `gemini-3.5-flash-lite`. Existing integration already uses Gemini REST `generateContent`. Audio pass preserves fillers by instruction, but preservation accuracy is not guaranteed.
- [OpenAI GPT-4o mini](https://developers.openai.com/api/docs/models/gpt-4o-mini): configurable vision fallback; vision results are flags only.

Task order: main transcription OpenAI → Groq; timing Groq; verbatim Gemini only; analysis/proofreading DeepSeek → Gemini → Groq; layout Gemini → OpenAI; quick tips Groq → Gemini. Missing keys are skipped. Each configured provider is attempted at most once. 429, 5xx, timeouts/network, invalid response JSON and invalid output schema fall through; existing 401/403/404 fallback is retained. Refusals/content blocks and request 400 errors stop without trying to bypass the response. The successful result includes `provider`, `model`, `usage`, `cached` and `audioSeconds`.

`parang`, `ano` and `like` can be meaningful words. Counts are labelled **possible fillers** and are not penalized as definite fillers. A failed verbatim pass returns `fillersAvailable: false` and `fillerCount: null`, not zero. Missing timing or filler evidence yields no aggregate score. The main and timing transcripts can disagree; actual accuracy must be benchmarked before enabling scoring in production.

## Configuration

Existing keys stay in `.env.local`, Vercel secrets or worker secrets. Never commit actual keys. Defaults and new names are in `.env.example`. Model overrides use `PROVIDER_TASK_MODEL` (e.g. `GROQ_QUICKTIPS_MODEL`, `GEMINI_ANALYSIS_MODEL`); general `PROVIDER_MODEL` is the text/vision fallback. Transcription/timing have explicit defaults independent of text models.

OpenAI and DeepSeek are treated as paid. Gemini/Groq are also gated if `GEMINI_PAID=true` / `GROQ_PAID=true`. Paid calls are disabled without an injected `admit` function. **The production daily budget ledger has not been implemented yet**; the hook is not a substitute for an atomic persistent budget. `cost: null` means not measured, not free. The next stage must reserve a conservative maximum atomically before requests and retain reservations for uncertain failures. Do not enable paid production routes by supplying an always-true admission function.

The cache hook uses user identity + input hash + task + prompt/version + provider models. It has no default persistent storage. A production adapter needs tenant controls, expiry, deletion/retention policy and encryption as appropriate; it may contain analysis text, unlike telemetry. An outage must not cause a second billable generation after success.

These are server-library interfaces, **not public routes**. `userId` must come from verified Supabase authentication, not a request body. An HTTP caller must enforce consent, email verification, quotas and entitlement before invoking the router, including before cache reads. The new modules do not change existing auth behavior.

## Example server call and response

```js
const route = createTaskRouter({ env: process.env, fetchImpl: fetch });
const result = await route({
  task: 'quickTips', userId: authenticatedUser.id, consent: true,
  input: { text: 'Give one short tip for opening a presentation.' }
});
// { data: '...', provider: 'groq', model: 'openai/gpt-oss-20b',
//   cached: false, usage: { inputTokens: 30, outputTokens: 20 }, audioSeconds: 0 }
```

Structured analysis input is `JSON.stringify({metrics: result.metrics.compact, transcript})`; response data has `redundancies`, `unclearSentences`, `fillerPatterns`, `adjustments`. Lists have a maximum of three entries. Long transcripts are chunked to 8,000 characters and bounded lists are merged/deduplicated in code; cross-chunk context needs evaluation.

## Accuracy benchmark

Install FFmpeg locally and put it on PATH or set `FFMPEG_PATH`. No executable is downloaded or assumed present. Create a **private, untracked** manifest such as `benchmarks/private/samples.json`:

```json
[
  { "audio": "english.wav", "reference": "Um today I will present our results." },
  { "audio": "taglish.wav", "reference": "Uh parang ano ang result ng test natin." }
]
```

References must be manually checked verbatim, including fillers/repetitions. Use consented recordings representative of quiet speech, accents, Taglish, background noise and deliberate pauses. Maximum five recordings, 120 seconds total after normalization, 30 provider attempts. All local conversion/validation occurs before provider calls. Source files are never modified; only temporary normalized WAVs are removed.

```powershell
node --env-file=.env.local tools/compare-transcription.mjs benchmarks/private/samples.json --consent
# Optional deliberate paid OpenAI comparison (uses your API credits):
node --env-file=.env.local tools/compare-transcription.mjs benchmarks/private/samples.json --consent --allow-paid
```

The second command explicitly enables paid benchmark attempts, bounded by recording/call caps, **not a dollar cap or daily budget**. Inspect billing before choosing it. This CLI compares providers independently, not fallback quality. It prints numbered samples instead of paths; neither transcript nor reference is logged. Costs remain unknown unless separately reconciled. Tokenization ignores punctuation/case for WER. Counts alone are not filler precision/recall; word timing accuracy requires human-labelled timestamps. Word-boundary loss from fixed 60-second chunks requires evaluation or future overlap/merge work.

No recordings or human reference transcripts were supplied. FFmpeg was not found on PATH during inspection. Therefore no live transcription benchmark or accuracy claims have been made; no new paid API calls were made for this stage.

## Next stages (not implemented by stage 1)

2. Limits and production plumbing: atomic entitlement/upload reservation/refund events, five lifetime uploads, hash cache ownership, practice caps, RLS/concurrency SQL tests, verified email/disposable domains/signup and upload rate limits, suspicious-cluster review, daily budget reservations, worker jobs, shared pre-evaluation/practice result persistence and baseline comparison. Preserve original recording timebase, route consent and existing result access. Authenticated file validation and atomic reservation must precede storage; then upload original before parsing/AI. `FREE_UPLOAD_LIMIT` must be server-controlled, never a client argument.
3. PPT correction: defensive ZIP/XML handling, run mapping, local checks, changed-slide batching/cache, review/accept/reject UI, corrected copy retaining original, optional slide-image flags. Do not add entitlement billing before failure/refund paths and concurrency tests pass.
4. Payments: provider interface and manual grants, disabled-by-default paywall, signed raw-body webhook adapters, idempotency/event ordering, cancellation period-end semantics and provider sandbox tests. No live checkout or payment provider was selected/connected.

## Philippines payment research for stage 4

- [PayMongo Philippine entities](https://docs.paymongo.com/docs/account-settings-philippine-entities): verification documents depend on registration type. [Account creation](https://docs.paymongo.com/docs/get-started-create-your-account) describes business registration, TIN and business address for business verification. Actual capabilities depend on account review; do not assume approval from API key possession.
- [Paddle seller countries](https://www.paddle.com/help/start/account-verification/which-countries-are-supported-by-paddle): Philippines is not in the unsupported supplier list; this indicates geographic eligibility, not business approval. Seller/domain/identity verification and supported-product review still need confirmation for this app.
- [Lemon Squeezy supported countries](https://docs.lemonsqueezy.com/help/getting-started/supported-countries) lists Philippines. [Store activation](https://docs.lemonsqueezy.com/help/getting-started/activate-your-store) requires review; bank/PayPal payout eligibility must be checked for the actual owner.

Unverified: all providers' current project quotas/billing/model permissions; user business registration and seller approval; live auth/email settings; disposable-domain policy; FFmpeg/worker hosting; billing budget and prices; retention/consent requirements; benchmark accuracy; real database RLS/concurrency execution. No migrations or payment changes are required to run stage 1 unit tests.
