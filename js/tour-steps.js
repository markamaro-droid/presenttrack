/* A short first visit explains the workspace before inviting the user to evaluate.
   Gated pages are explained as a whole; the tour never bypasses their access rules. */
window.PTOnboardingSteps = [
  { nav:'dash', view:'dash', target:'.dh-hero', title:'Welcome to your dashboard',
    description:'I’m Tracy, your presentation coach. Let me show you around. You can pause, go back, or skip this tour anytime.' },
  { nav:'dash', view:'dash', target:'.dh-journey', title:'Your path to confident presenting',
    description:'First, take a short speaking evaluation. Then add a presentation, rehearse aloud, and review your feedback.' },
  { nav:'dash', view:'dash', target:'.dh-stats', title:'See your practice at a glance',
    description:'Your presentations, practice time, and latest score appear here. These numbers grow as you rehearse.' },
  { nav:'decks', view:'decks', target:'#view', title:'My Presentations',
    description:'After your evaluation, add your slides or create a practice draft here. Choose a presentation to record a rehearsal and get feedback.' },
  { nav:'perf', view:'perf', target:'#view', title:'Understand your feedback',
    description:'Performance helps you review speaking pace, filler words, pauses, and scores after each analyzed rehearsal.' },
  { nav:'prog', view:'prog', target:'#view', title:'Build your progress',
    description:'Compare your practice attempts here and work toward speaking goals. Your progress appears after you start rehearsing.' },
  { nav:'hist', view:'hist', target:'#view', title:'Find past practice sessions',
    description:'Practice History keeps your completed sessions and reports together, so you can return to your feedback anytime.' },
  { nav:'set', view:'set', target:'#settings-coaching', title:'Tracy is here to help',
    description:'Choose whether I speak aloud here. Select Tour guide in the menu whenever you want another walkthrough.' },
  { nav:'eval', view:'eval', target:'#view', title:'Ready for your first evaluation?',
    description:'This short speaking evaluation establishes your starting point. Read the instructions and start when you are ready. I’ll be here to help.', fin:true }
].map(step=>({...step,voiceLine:step.description}));

/* Single source for tour targets, visible copy and narration. Unavailable controls are skipped. */
window.PTTourSteps = [
  {
    "nav": "dash",
    "view": "dash",
    "target": ".dh-hero",
    "title": "Dashboard",
    "description": "Welcome! This is your starting point for your next rehearsal.",
    "voiceLine": "Welcome! This is your starting point for your next rehearsal."
  },
  {
    "nav": "dash",
    "view": "dash",
    "target": ".dh-stats",
    "title": "Dashboard",
    "description": "See your presentation count, practice activity and latest score here.",
    "voiceLine": "See your presentation count, practice activity and latest score here."
  },
  {
    "nav": "dash",
    "view": "dash",
    "target": ".dh-readiness",
    "title": "Ready for the room?",
    "description": "Review your preparation checklist before presenting.",
    "voiceLine": "Review your preparation checklist before presenting."
  },
  {
    "nav": "eval",
    "view": "eval",
    "target": "#view",
    "title": "Evaluation",
    "description": "Complete Evaluation to establish your speaking baseline.",
    "voiceLine": "Complete Evaluation to establish your speaking baseline."
  },
  {
    "nav": "decks",
    "view": "decks",
    "target": "[data-sec=\"quick-actions\"]",
    "title": "Your practice toolkit",
    "description": "Use Upload slides, Practice, Analyze recording, Reports or Goals to choose your next task.",
    "voiceLine": "Use Upload slides, Practice, Analyze recording, Reports or Goals to choose your next task."
  },
  {
    "nav": "decks",
    "view": "decks",
    "target": "#ut",
    "title": "Presentation title",
    "description": "Give your presentation a title you will recognize.",
    "voiceLine": "Give your presentation a title you will recognize."
  },
  {
    "nav": "decks",
    "view": "decks",
    "target": "#dz",
    "title": "Drop your file here or select one",
    "description": "Choose your presentation file here.",
    "voiceLine": "Choose your presentation file here."
  },
  {
    "nav": "decks",
    "view": "decks",
    "target": "#ua",
    "title": "ADD PRESENTATION",
    "description": "Select ADD PRESENTATION to save your presentation.",
    "voiceLine": "Select Add presentation to save your presentation."
  },
  {
    "nav": "decks",
    "view": "decks",
    "target": "[data-go=\"create\"]",
    "title": "Create without slides",
    "description": "Use Create without slides when you only need a practice draft.",
    "voiceLine": "Use Create without slides when you only need a practice draft."
  },
  {
    "nav": "decks",
    "view": "prac",
    "target": "#pd",
    "title": "Presentation",
    "description": "Choose which presentation you want to rehearse.",
    "voiceLine": "Choose which presentation you want to rehearse."
  },
  {
    "nav": "decks",
    "view": "prac",
    "target": "#pdur",
    "title": "Target duration (minutes)",
    "description": "Set your target length here. Recorded analysis supports up to ten minutes.",
    "voiceLine": "Set your target length here. Recorded analysis supports up to ten minutes."
  },
  {
    "nav": "decks",
    "view": "prac",
    "target": "#vfs",
    "title": "Start",
    "description": "Read the audio consent, then select Start under Your slides to open full screen and record.",
    "voiceLine": "Read the audio consent, then select Start under Your slides to open full screen and record."
  },
  {
    "nav": "decks",
    "view": "prac",
    "target": "#pfin",
    "title": "Finish",
    "description": "Select Finish to analyze your recording and create a report.",
    "voiceLine": "Select Finish to analyze your recording and create a report."
  },
  {
    "nav": "decks",
    "view": "rec",
    "target": "#ra",
    "title": "ANALYZE RECORDING",
    "description": "You can also upload an existing recording. Choose a presentation and file, give consent, then select ANALYZE RECORDING.",
    "voiceLine": "Have a recording already? Choose your file, give consent, then select Analyze recording."
  },
  {
    "nav": "perf",
    "view": "perf",
    "target": ".ws-stats",
    "title": "Performance",
    "description": "Review speaking pace, filler frequency, long-pause frequency and performance score.",
    "voiceLine": "Review speaking pace, filler frequency, long-pause frequency and performance score."
  },
  {
    "nav": "perf",
    "view": "perf",
    "target": "#ws-a",
    "title": "Earlier / reference",
    "description": "Choose Earlier / reference and Comparison attempt to compare two attempts.",
    "voiceLine": "Choose Earlier / reference and Comparison attempt to compare two attempts."
  },
  {
    "nav": "prog",
    "view": "prog",
    "target": "[aria-label=\"Chart metric\"]",
    "title": "Progress",
    "description": "Switch between Performance score, Speaking pace, Filler frequency, Long-pause frequency and Duration.",
    "voiceLine": "Switch between Performance score, Speaking pace, Filler frequency, Long-pause frequency and Duration."
  },
  {
    "nav": "prog",
    "view": "prog",
    "target": ".ws-analytics-cards",
    "title": "Progress",
    "description": "Review your latest and average scores, filler frequency and pace in the reference range.",
    "voiceLine": "Review your latest and average scores, filler frequency and pace in the reference range."
  },
  {
    "nav": "prog",
    "view": "prog",
    "target": ".ws-analytics-detail",
    "title": "First attempt vs latest",
    "description": "Compare your first and latest attempts, then check Your practice rhythm. Sample previews are labeled.",
    "voiceLine": "Compare your first and latest attempts, then check Your practice rhythm. Sample previews are labeled."
  },
  {
    "nav": "prog",
    "view": "goals",
    "target": "#ws-goal-form",
    "title": "Create a practice goal",
    "description": "Give your goal a name, choose what to track, then select Add goal.",
    "voiceLine": "Give your goal a name, choose what to track, then select Add goal."
  },
  {
    "nav": "hist",
    "view": "hist",
    "target": ".ws-filters",
    "title": "Practice History",
    "description": "Filter your history by Presentation, Date range or Session type.",
    "voiceLine": "Filter your history by Presentation, Date range or Session type."
  },
  {
    "nav": "hist",
    "view": "hist",
    "target": "#ws-export",
    "title": "Export filtered CSV",
    "description": "Select Export filtered CSV to download the matching session measurements.",
    "voiceLine": "Select Export filtered C S V to download these session measurements."
  },
  {
    "nav": "note",
    "view": "note",
    "target": "[data-act=\"markall\"]",
    "title": "Mark all as read",
    "description": "Review Notifications, then use Mark all as read when you are caught up.",
    "voiceLine": "Review Notifications, then use Mark all as read when you are caught up."
  },
  {
    "nav": "set",
    "view": "set",
    "target": "#settings-profile",
    "title": "Profile",
    "description": "Use Change photo or edit Full name, then select Save profile.",
    "voiceLine": "Use Change photo or edit Full name, then select Save profile."
  },
  {
    "nav": "set",
    "view": "set",
    "target": "#settings-appearance",
    "title": "Appearance",
    "description": "Choose Light or Dark for this browser.",
    "voiceLine": "Choose Light or Dark for this browser."
  },
  {
    "nav": "set",
    "view": "set",
    "target": "#settings-coaching",
    "title": "Coaching Preferences",
    "description": "Use Tracy speaks aloud for voice guidance. Replay tour brings you back here anytime.",
    "voiceLine": "Use Tracy speaks aloud for voice guidance. Replay tour brings you back here anytime."
  },
  {
    "nav": "dash",
    "view": "dash",
    "target": ".dh-hero",
    "title": "Dashboard",
    "description": "You are ready to explore. Open My Presentations to choose your next step.",
    "voiceLine": "You are ready to explore. Open My Presentations to choose your next step.",
    "fin": true
  }
];
