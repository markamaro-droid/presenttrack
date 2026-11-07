# PresentTrack thesis alignment and module audit

Reviewed 7 November 2026 against the supplied `Capstone-Thesis.docx`.
This is a repository audit; it does not certify the deployed website or research accuracy.

## What the attachment actually specifies

The attachment contains **Chapter 1 only**: rationale, problem statement,
research questions, significance, scope/limitations and operational definitions.
The document has 136 XML paragraphs (85 non-empty), no tables or body drawings.
The header identifies Metro Dumaguete College; the footnote/endnote parts contain
no additional requirements. It does not contain a use-case diagram, schema,
module specification, formal rubric or separate objectives chapter.

The functional objective inferred from the rationale and scope is an integrated
student workflow for preparation, practice, transcription, selected speech
measurements, feedback, reporting, repeated attempts, comparisons and readiness.
The research questions about needs, habits and acceptance describe the study;
they are not instructions to build an in-app research questionnaire.

### Roles and boundaries

- **Student / presenter:** the explicit primary user; registration/login and a
  private personal workspace for presentations, sessions, reports and goals.
- **Teachers/facilitators:** beneficiaries who can use performance information
  to supplement their guidance. No separate teacher login, roster, grading,
  account browsing or sharing permissions are specified. Students can export
  reports/CSV for voluntary sharing; there is no cross-account teacher access.
- Institutions, developers and researchers are stakeholders, not specified
  application roles. Creating admin permissions from those descriptions would
  require a separate access-control requirement.
- Presentation content accuracy, subject expertise, visual quality, body
  language, persuasiveness and overall communication ability remain outside
  automated evaluation. The UI must not imply these were measured.

## Requirement traceability

Paragraph references are the original Word XML paragraph indexes, useful when
checking the source. Paragraphs 77–81 define scope and limitations; paragraphs
89–111 define the operational terms.

| Thesis requirement | Module / existing implementation | Gap addressed in this change |
| --- | --- | --- |
| Registration and login (§77) | Supabase Auth; private `user_data` snapshots and private presentation storage | Settings now saves the display name through Auth. Email is read-only instead of pretending a local edit changes the login email. |
| Presentation creation and session setup (§77) | My Presentations uploads PDF/DOCX/PowerPoint, titles, previews, rename/delete | Added a presentation draft without slides, setup fields for title, target, date, time and preparation notes; library search. |
| Customizable timer and practice management (§77) | Practice: target minutes, microphone, pause/resume/reset/finish, fullscreen and slide navigation | Preserved capture/viewer behavior; shared responsive surfaces; duration and target remain visible in reports/setup. |
| Recording **or** uploading (§78) | Browser MediaRecorder and Upload Recording; authenticated `/api/practice` | Preserved consent and input limits. Corrected the upload format description to match accepted files. |
| Speech-to-text and selected indicators (§78, 89–100) | Browser recognition for Evaluation; Groq Whisper for recorded practice; code-based metrics and scoring | Reports expose rubric dimensions. Comparison uses per-minute fillers/pauses, explicitly discloses distinct recognition sources, and avoids claiming every rate change is improvement. |
| Automated/performance feedback (§78, 89–92) | Rule-based feedback from measurable criteria; Tracy conversational assistance | Coach now presents strengths, improvements and a numbered plan with practice/goal actions. No fabricated section-specific or scheduled-event claims. |
| Performance reporting (§78, 93, 109) | Session report, saved transcript/quality, PDF export | Searchable report library, filtered CSV export, rubric breakdown. PDF provenance text corrected and long feedback pagination fixed. |
| Practice history (§78, 98) | Saved session snapshots and individual reports | Search, presentation/date/source filters, sort by date/score; clear distinction between evaluation, analyzed practice and legacy unverified entries. New evaluations save ISO timestamps. |
| Comparison of previous sessions (§78, 107) | Previously only first/latest metrics | Select **any two** matching rehearsals or the pre-evaluation baseline, with comparison bars and numeric differences. Missing baseline score is not replaced with a possibly outdated score. |
| Progress tracking (§78, 104) | Previously sparse metric chart and text goals | Linked presentation/date filters, five selectable trend metrics, accessible chart-data tables, practice totals, recent attempts and dynamic goals. Single-session charts show one point. |
| Weak-point identification (§78, 105) | Latest analyzed improvements and focused practice | Coach/Performance connect prioritized actions to focused practice and measurable goals. |
| Presentation readiness (§78, 96) | Preparation checklist and dashboard overview | One shared calculation across dashboard, cards, detail and readiness; only analyzed attempts count. Schedule, profile/final rehearsal and notes are editable. |
| Virtual preparation environment (§110–111) | Dashboard, evaluation, presentations, practice, reports, progress | Consistent responsive cards, hierarchy, icon accents, compact tables and useful baseline/empty states across modules. |

### Module-by-module review

| Module | Result |
| --- | --- |
| Dashboard | Retains the existing redesigned next-step hero, journey, real summary cards, score chart, baseline state, recent activity, tools and notifications. Readiness now agrees with all other modules. |
| Evaluation | Built-in five-slide task, retake, fullscreen, timing, save/retry and visual result report retained. Shared styling added; future session entries carry a full timestamp. |
| My Presentations | Upload/preview/delete/rename preserved; draft creation, search and persistent setup added. A draft can be practiced without a slide file. Uploading a file still creates a new presentation. |
| Practice / focused practice | Existing audio capture, timer, slides and fullscreen unchanged. Feedback determines focus. Reset/navigation still release microphone capture. |
| Upload Recording | Actual transcription route retained; accepted-format text corrected. |
| Performance | Redesigned metrics, selectable comparison bars, baseline state, plan and measurement guide. Available even before the first session. |
| Progress | Redesigned trends, linked filters, measured goals, totals and recent attempts. No fabricated charts for empty accounts. |
| History / Reports | Search/filter/sort/table/CSV, preserved report navigation and PDF export. Legacy rows remain available. |
| Individual Report | Existing measurements, transcript, caveats, feedback and PDF; added scoring dimension explanation. Evaluation links open its dedicated results. |
| Coach | Real latest-session strengths, improvements and actionable practice plan. |
| Goals | Add/edit/delete; measured rehearsal count, score and filler-frequency targets scoped to a presentation or all presentations; optional due date; explicit self-reported checklist completion. Existing free-text goals are retained as self-reported. |
| Readiness | Saved title, target, schedule, preparation notes, self-reported profile/final rehearsal; derived quality and analyzed-practice checks. |
| Notifications | Existing read/unread and mark-all controls preserved, unified cards and report/goal actions added. Does not claim email reminders are sent. |
| Settings | Working profile save, read-only login email, existing theme/voice/photo/tour controls, privacy information. Nonfunctional email-reminder toggles and production prototype reset controls removed. |
| Help / search / shell | Help updated for real audio analysis and review workflow; existing global search and navigation retained. |

## Data fields and workflows

No database table changes are needed for this patch. New optional fields live in
the existing authenticated user's JSON snapshot; old rows remain readable.

| Object | Fields / source |
| --- | --- |
| Identity | Supabase Auth user ID, email, `user_metadata.full_name`; no client-assigned privileged role. |
| Presentation | Existing `id`, `t`, `short`, `file`, `path`, preview, `target`, `ppt`, `sp`, `rq`, `final`; new optional `scheduledDate` (YYYY-MM-DD), `scheduledTime` (HH:mm), `preparationNotes`. Legacy `date`, `time`, `left` remain compatible. |
| Session | `id`, `deckId`, title snapshot, `at` (ISO when available), `d`, `dur`, `tg`, `wpm`, `fill`, `pau`, `score`, `source`, `analysis` (transcript, metrics, quality, feedback, criteria/dimensions). Evaluation entries have `assess: true`. |
| Baseline | Existing `ev.done`, `ev.at`, `ev.results`; completion flag is protected by the existing server RPC. Rehearsals never replace it. |
| Goal | Existing `t`, `p`; optional `metric` (`sessions`, `score`, `fillerRate`, `manual`), `target`, `deckId`, `due`. Measured progress is derived on render, never fabricated or written as an AI result. |
| Notifications | Existing title/body/icon/read state. No background email service is introduced. |
| Review filters | In-memory presentation, date range, source, search, sort and comparison selection; reset on account switch. Not access-control or persisted user data. |

Workflow: sign in → evaluation/baseline → upload or create a presentation → set
target/schedule → consent and record (or upload a recording) → analyze → save
report → review strengths/weak points → set goal → rehearse again → compare
attempts and trends → update preparation checklist. Export/sharing is deliberate.

The existing Supabase Auth, per-user data and storage policies remain the access
boundary. This frontend patch does not grant new roles, weaken RLS, or change
provider authentication/quota checks.

## Design references

- [Carbon dashboard guidance](https://v10.carbondesignsystem.com/data-visualization/dashboards/): clear hierarchy, consistent charts and linked exploration filters.
- [Carbon chart types](https://www.carbondesignsystem.com/building-blocks/data-visualization/simple-charts): line charts for repeated observations and bars for comparisons.
- [Mobbin dashboard study](https://mobbin.com/blog/what-good-dashboard-design-looks-like): prioritize a next action and useful account context.

The implementation uses PresentTrack's own markup, CSS, icons and SVG charts;
no reference site's assets or layouts were copied. Violet remains the primary
accent, with cyan/amber/green metric cues and theme-aware card surfaces.

## Validation and unverified assumptions

- Automated tests cover data-source isolation, date/presentation filters,
  missing values, baseline separation, goal progress, readiness consistency,
  CSV formula protection and empty/populated UI states, alongside existing
  auth/provider, capture and evaluation tests.
- Browser checks use synthetic fixtures in an isolated local browser, not
  fabricated records saved to a real account. Desktop/mobile render, form,
  filter and navigation checks do not validate a real provider response.
- No new environment variables or SQL migrations are introduced. Existing
  Auth/storage/evaluation RPC and `/api/practice` provider setup are still
  required. Production deployment and database policies were not changed.
- The attached file is a proposal chapter, not proof that a rubric is validated.
  Pace bands and scores are application coaching rules. Transcription can omit
  fillers or misestimate pauses; a manually annotated recording benchmark is
  still needed for research accuracy claims.
- Recorded analysis currently supports 20 seconds–10 minutes and 3 MB. Timers
  may be set longer for preparation, but analysis requires a short section.
  Raw audio is not retained for later playback; reports/transcripts are retained.
  This satisfies the thesis's configurable recording-or-uploading wording,
  but persistent media playback would require storage/retention requirements.
- Human assessment, a teacher portal, school administration, in-app surveys,
  payments and PPT auto-correction are not specified by this attachment and
  are not represented as implemented thesis requirements.
- Legacy sessions without ISO timestamps appear under All time only. Earlier
  evaluation rows retain their saved provenance; new evaluations save timestamps.
- Due dates on goals are planning aids, not email reminders. Readiness is a
  checklist, not a guarantee of audience performance.
