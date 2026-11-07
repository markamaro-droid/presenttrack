# PresentTrack operational-definition audit

Audited November 7, 2026. This describes repository behavior, not confirmation
that the latest changes are deployed. Definitions describe concepts as well as
features; concepts do not each need a new navigation module.

## Findings and module mapping

| Study term | Module / implementation now | Qualification |
| --- | --- | --- |
| Automated Feedback | Evaluation, Practice report, Automated Coach | Deterministic recommendations from analyzed indicators; not every recommendation uses a generative model. |
| Filler Words | Evaluation and recorded-audio practice analysis | Selected tokens and phrases; transcription can omit fillers. Counts are estimates. |
| Performance Analysis | Evaluation; My Presentations → Practice / Upload Recording | Replaced fixed practice WPM and randomly generated uploaded-recording metrics with authenticated Groq transcription and code-based scoring. |
| Performance Feedback | Report, Coach, Weak-Point Practice | Strengths, improvements and next actions from saved analysis. Removed fabricated section-specific pace claims. |
| Performance Report | Practice History → View Report | Measurements, score, feedback, recognized transcript, quality caveats and existing PDF export. |
| Practice History | Practice History | Account snapshot saves sessions and reports. Legacy prototype sessions are labeled unverified. |
| Practice Performance Comparison | Performance | First/latest analyzed sessions, presentation selector, pre-evaluation versus latest practice table. |
| Practice Session | My Presentations → Practice | Microphone capture, pause/resume, finish, analysis, saved report. Reset/leave releases capture. |
| PresentTrack | Existing web application shell | Integrated practice, analysis and monitoring workflow; not a separately added function. |
| Presentation Readiness | Dashboard / presentation readiness | Derived from preparation checklist. Added date, profile and final-rehearsal controls; final rehearsal/profile are self-reported. Not a guarantee of success. |
| Presentation Performance | Evaluation and practice reports | Selected speech and timing indicators only; no claims about body language or audience comprehension. |
| Presentation Performance Score | Evaluation and recorded practice | Shared versioned rubric, configurable duration around the practice target. No fixed neutral WPM or random score inputs. |
| Presentation Practice | My Presentations → Practice | Existing uploaded-slide viewer, navigation, fullscreen, now microphone-based analysis. |
| Presentation Practice Timer | Practice toolbar and fullscreen | Elapsed time, target, pause/resume and overrun display. Recording analysis capped at ten minutes. |
| Progress Tracking | Progress | Actual analyzed-session charts, per-presentation filtering, neutral change descriptions. Legacy unverified records excluded from charts. |
| Speaking Pace | Reports / Performance / Progress | Recognized words divided by total recording minutes. 100–160 WPM coaching reference, not a universal standard. |
| Speaking Performance | Reports | Pace, selected fillers, estimated timestamp gaps and duration. |
| Speech-to-Text | Evaluation / recorded practice | Browser recognition for pre-evaluation; Groq Whisper for practice recordings. Separate sources are disclosed. |
| Time Management | Practice timer and report | Duration compared with the selected target; full duration credit within ±10%, partial within ±25%. Product rubric, not a validated research norm. |
| Virtual Presentation Environment | My Presentations → Practice | Uploaded slides, fullscreen rehearsal, timer and controls. |
| Weak-Point Analysis | Coach / Weak-Point Practice | Uses the latest analyzed session's improvements and recommendations rather than a fixed introduction warning. |
| Web-Based System | Existing browser app and Vercel APIs | Network access required for cloud authentication, transcription and saving. |

## Deployment and limits

- Deploy the new `/api/practice` route and frontend together. Local development
  also registers this route. No new database schema or service-role key is used.
- Required existing Production variables: `GROQ_API_KEY`, `SUPABASE_URL`,
  `SUPABASE_ANON_KEY`. Optional: `GROQ_TRANSCRIPTION_MODEL` (default
  `whisper-large-v3`). This feature currently uses Groq, without paid fallback.
- Reuses `take_tracy_slot('voice')`: limits are shared with Tracy voice sessions
  (2/minute, 6/hour, 12/day in the existing migration). Failed upstream attempts
  consume a slot; retries are explicit. Provider account limits also apply.
- Audio requests require explicit consent and authenticated identity before a
  provider call. Media stays in memory; saved session reports include transcripts.
- Maximum encoded file input: 3 MB; analyzed duration: 20 seconds–10 minutes.
  Supported formats: MP3, M4A, WAV, OGG, WebM, MP4. Other formats and larger files
  fail explicitly. There is no background-job/chunking system for longer files.
- Browser capture requests low-bitrate audio, but encoder output varies by browser.
- Upload and practice speech processing do not call the pre-evaluation completion
  RPC or replace the user's baseline. Retaking Evaluation remains separate.
- Existing snapshots persist through `PTCloud.saveNow`; save errors are shown.
  Old prototype entries are preserved for review, never silently deleted.
- Reports do not assert that a lower WPM is improvement or that every later score
  rose. Cross-topic and cross-recognizer comparisons are explicitly qualified.

## Validation and remaining verification

- Automated tests cover valid analyzed metrics, authentication/consent/quota
  rejection before provider calls, invalid inputs and timestamps, missing speech,
  pause/resume, retryable audio, and late microphone permission after navigation.
- Browser smoke checks cover Practice, Upload Recording, Performance, Progress,
  Coach, Readiness and Weak-Point Practice.
- A real microphone recording, live Groq response and authenticated Supabase save
  still require an end-to-end test after deployment. No live paid call was made
  while implementing these changes. Provider response tests use fixtures.
- Filler preservation, pause accuracy and transcription accuracy require a
  benchmark against manually annotated recordings before claiming validated
  research accuracy. The current values are estimates, not ground truth.

Provider reference: [Groq audio transcription API](https://console.groq.com/docs/api-reference),
checked November 7, 2026 for verbose JSON and word/segment timestamps.
