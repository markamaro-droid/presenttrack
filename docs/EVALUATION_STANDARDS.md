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

Browser evaluations use recognized word count / elapsed minutes, including
pauses. Recognition phrase events do not supply reliable word timestamps; the
previous interpolation-based speaking-time denominator is no longer used for
browser pace scoring. Pause counts still use estimated timings and fillers may
be omitted by recognition. Neither can be claimed to be accurate audio analysis.
The timestamp-based audio pipeline is unchanged.

New evaluations save the criteria version and snapshot. Saved browser evaluations
are re-scored in the results view using current criteria and rule-based feedback.
This does not overwrite saved baselines or historical session scores. The results
details explain this and expose the recognized transcript for checking omissions.

Duration (2–3 minutes), filler and pause thresholds are unchanged task-specific
rubrics. They are not universal standards. No database migration is required.
Deploy frontend assets for browser evaluation; deploy affected Supabase Edge
Functions separately if using their shared scoring code in production.
