# Dashboard refresh

The home dashboard now uses a prioritized next-action panel, a four-step
preparation path, compact statistics, and two-column overview panels. Purple
colors, typography, sidebar and existing route handlers are retained.

States:
- New account: evaluation call to action; no fabricated score or trend.
- Evaluation completed: baseline metrics and upload call to action.
- Slides added: rehearsal action, presentation target/date and readiness checklist.
- Analyzed practice available: actual session score chart and latest coaching tip.

Pre-evaluation is explicitly separate from analyzed rehearsal counts. Legacy
unverified sessions remain in History but do not populate dashboard charts.
Readiness measures preparation activities; it is not a prediction of performance.
Dashboard notifications are condensed to the latest update, with the full list
available through Notifications. Reports, goals, recording upload and practice
remain available from the toolkit and sidebar.

Design references reviewed November 7, 2026:
- [Mobbin dashboard design study](https://mobbin.com/blog/what-good-dashboard-design-looks-like): prioritize the next action and reduce competing information.
- [Duolingo home redesign](https://blog.duolingo.com/new-duolingo-home-screen-design/): show the learner's current step and a clear path forward.

No external artwork, additional libraries, API calls, schema changes or environment
variables were added. Styles are scoped to the dashboard. Tests cover new,
baseline-only and analyzed-practice states, HTML escaping and absent-chart states.
Desktop (1440px), mobile (390px) and upload navigation were checked locally with
sample data; no production account data was changed.
