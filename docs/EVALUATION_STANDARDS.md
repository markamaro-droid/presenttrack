# Evaluation rubric v2

This is an application coaching rubric, not a validated public-speaking assessment
or a universal definition of good delivery. WPM cannot establish comprehension.

## Pace

Reference range: 100–160 WPM (2 points). Near range: 90–99 or 161–180
(1 point). Outside that range: 0 points, with neutral labels and advice to verify
the measurement before changing delivery. The outer bands are product choices,
not research-validated cutoffs. 104 WPM receives 2 pace points.

Sources checked November 7, 2026:

- [University of Queensland](https://my.uq.edu.au/information-and-services/student-support/study-skills-and-learning-advice/study-skills-and-learning-advice-overview/presentation-skills?p=2): about 100 WPM.
- [University of Kent](https://student.kent.ac.uk/studies/giving-an-oral-presentation): 100–130 scripted, 130–160 unscripted.
- [University of Melbourne](https://students.unimelb.edu.au/academic-skills/communication-skills-study-assessment/oral-assessments/speaking-clearly): approximately 150–160 WPM.

The variation is why one narrow range should not be treated as universal.

## Measurement and saved reports

Recorded evaluations use recognized word count divided by audio duration, including
pauses. Long pauses come from audio word timestamps, with a two-second threshold;
leading and trailing silence are excluded. Fillers use a separate verbatim audio
transcript. Missing measurements cannot earn points. These remain recognition
estimates, not ground-truth counts.

Before applying this delivery rubric, the server requires at least 90 seconds,
enough meaningful speech and coverage of the built-in slide content. Number drills,
excessive repetition and insufficient topic coverage receive no baseline. The content
check uses vocabulary overlap; it does not grade factual correctness. The target
remains 2?3 minutes. See [evaluation implementation and setup](EVALUATION.md) for
eligibility thresholds and limitations.

New evaluations save the criteria snapshot and recorded result. Saved browser-only
results now require a retake instead of being rescored from unreliable timings.
Existing historical records are retained, but their scores and filler/pause counts
do not contribute to the displayed evaluation baseline or comparisons.

Deploy the frontend and recording backend together and apply
`supabase/migrations/20261110_recorded_evaluation.sql`. Both Groq and Gemini keys
are required for the built-in evaluation. Deploy affected Supabase Edge Functions
separately if using the shared scoring code there.
