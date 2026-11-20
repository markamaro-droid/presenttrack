/* Only a direct user message can select one of these local, read-only workflows.
   Model replies, slide text and selectors from the network are never executed. */
(() => {
  function intent(message) {
    const t = String(message || '').toLowerCase().replace(/[’']/g, '').replace(/\s+/g, ' ').trim();
    if (!t || t.length > 2000 || /["“”`<>]/.test(t) || /\b(dont|do not|never|stop|cancel|not now|no thanks|without|instead of|if i|if someone|for example|hypothetically|told me|said|says|suggested|mentioned|what happens when|huwag|wag)\b/.test(t)) return null;
    if (/^(?:tracy[, ]+)?(?:please )?(?:can you |could you )?(?:guide me(?: again)?|show me around|give me a tour|start (?:the )?tour)[.!?]*$/.test(t)) return 'tour';
    const ask = /\b(go to|open|take me|bring me|navigate|show me|guide me|walk me through|help me (start|use|find|upload|practice|rehearse)|where (do|can|should) i|where (is|are|can i find)|how (do|can) i (start|use|upload|find|view|open)|how to (start|use|upload)|i (want|would like|need) to (start|practice|practise|rehearse|upload|view|open)|lets (practice|rehearse)|start (a |my |the )?(practice|rehearsal)|paano (ako |ba )?(mag|magsimula)|dalhin|ipakita|gusto ko (mag|magsimula))\b/.test(t);
    if (!ask) return null;
    if (/\b(practice history|past sessions|previous sessions)\b/.test(t)) return 'history';
    if (/\b(upload|add|import)\b.{0,35}\b(slides?|pptx?|powerpoint|pdf|presentation)\b/.test(t)) return 'upload';
    if (/\b(reports?|results?|feedback)\b/.test(t)) return 'reports';
    if (/\b(practice|practise|practicing|practising|rehearse|rehearsal|speaking test|magpractice|mag-practice)\b/.test(t)) return 'practice';
    if (/\b(performance|speaking pace|wpm|filler words)\b/.test(t)) return 'performance';
    if (/\b(goals?|targets?)\b/.test(t)) return 'goals';
    if (/\b(progress)\b/.test(t)) return 'progress';
    if (/\b(library|built-in|built in)\b/.test(t)) return 'library';
    if (/\b(my presentations|my slides|my files)\b/.test(t)) return 'presentations';
    if (/\b(settings|preferences|profile)\b/.test(t)) return 'settings';
    if (/\b(dashboard|home)\b/.test(t)) return 'dashboard';
    if (/\b(tour|around|system|app|website)\b/.test(t)) return 'tour';
    return null;
  }
  const step = (target, title, text, extra = {}) => ({ target, title, text, ...extra });
  function plan(kind, { pending = false, hasDecks = false } = {}) {
    if (['practice', 'upload'].includes(kind) && pending) return { route: 'eval', steps: [step('#view h1', 'Your starting point', 'Your first speaking evaluation unlocks presentation practice. Read the instructions here, then start when you are ready. I will leave the microphone and consent to you.', { fallback: '#view' })] };
    const upload = [
      step('#dz', 'Choose your slides', 'Select a PPTX or PDF from your device. PDFs display directly; PowerPoint previews are prepared by CloudConvert.'),
      step('#ut', 'Name your presentation', 'Use a title you will recognize. For PowerPoint, read the CloudConvert consent that appears after choosing your file.'),
      step('#ua', 'Save your presentation', 'Select Add presentation when you are ready. Once the preview is ready, the Practice button on its card opens your speaking setup.')
    ];
    const plans = {
      practice: hasDecks ? { route: 'decks', practice: true, steps: [
        step('#pd', 'Choose your presentation', 'I have opened Practice for you. Choose the presentation you want to rehearse here. You can change it before recording.'),
        step('#pdur', 'Set your speaking time', 'Choose a target duration in minutes. Recorded analysis supports up to ten minutes, so rehearse a short section of a longer talk.'),
        step('#pconsent', 'Review audio consent', 'Read the audio-processing notice. Tick this box yourself if you agree. Nothing has started recording.', { frame: 'label' }),
        step('#vfs', 'Start when you are ready', 'When your slides are ready and you have given consent, select Start to record. Speak through your slides, then select Finish to save your performance report. I will step aside as soon as you start.')
      ] } : { route: 'decks', steps: [step('#dz', 'Add your first presentation', 'Start by choosing your PPTX or PDF here. You can also use Create without slides, or choose a built-in presentation from Library.'), ...upload.slice(1)] },
      upload: { route: 'decks', steps: upload },
      presentations: { route: 'decks', steps: [step('#view h1', 'My Presentations', 'Your uploaded presentations live here. Each card has a Practice button that opens its timer and slides.', { fallback: '#view' }), ...upload] },
      reports: { route: 'rep', steps: [step('#view h1', 'Your practice reports', 'Open a completed session to review its score, speaking pace, filler words, pauses and feedback. Your first report appears after you finish an analyzed practice.', { fallback: '#view' })] },
      history: { route: 'hist', steps: [step('#view h1', 'Your saved sessions', 'Find previous attempts here. Use the filters to find a session and open its report to review what to practice next.', { fallback: '#view' })] },
      performance: { route: 'perf', steps: [step('#view h1', 'Understand your performance', 'Compare your analyzed attempts here. Review speaking pace, fillers, pauses and scores, then choose one area for your next rehearsal.', { fallback: '#view' })] },
      progress: { route: 'prog', steps: [step('#view h1', 'Follow your progress', 'Use the metric buttons to explore changes across your practice attempts. More analyzed rehearsals will build up your progress chart.', { fallback: '#view' })] },
      goals: { route: 'goals', steps: [step('#wg-title', 'Choose a practice goal', 'Give your goal a clear name, such as rehearse my introduction three times.'), step('#wg-type', 'Choose how to measure it', 'Choose a measurement and target value, then a presentation if you want to focus on one deck. Select Add goal yourself to save it.')] },
      library: { route: 'library', steps: [step('#view h1', 'Choose a built-in presentation', 'Browse a topic and open its details. Use its practice option when you have found one you want to rehearse.', { fallback: '#view' })] },
      settings: { route: 'set', steps: [step('#view h1', 'Your preferences', 'Manage your profile, appearance, Tracy voice and privacy settings here. I will leave any changes to you.', { fallback: '#view' })] },
      dashboard: { route: 'dash', steps: [step('.dh-hero', 'Your next step', 'Your dashboard brings together your presentations and recent practice. Choose a presentation to rehearse, or review your latest feedback.', { fallback: '#view h1' })] }
    };
    return Object.hasOwn(plans, kind) ? plans[kind] : null;
  }
  window.TracyGuidePlan = { intent, plan };
})();
