/* Shared device-voice delivery for Tracy's introduction and conversation. */
(() => {
  globalThis.TracySpeech = {
    configure(utterance, synth, language = 'en-US') {
      const lang = language.toLowerCase();
      const voices = (synth.getVoices?.() || []).filter(v => v.lang.toLowerCase().split('-')[0] === lang.split('-')[0]);
      const score = v => (/natural|neural|online/i.test(v.name) ? 40 : 0)
        + (/Aria|Jenny|Samantha|Google US English|Serena|Karen|Moira/i.test(v.name) ? 20 : 0)
        + (v.lang.toLowerCase() === lang ? 10 : 0);
      const voice = voices.sort((a, b) => score(b) - score(a))[0];
      utterance.voice = voice || null;
      utterance.lang = voice?.lang || language;
      // Small changes keep the voice expressive without making it shrill or rushed.
      const text = utterance.text || '';
      const reassuring = /\b(nervous|worried|overwhelmed|take your time|no rush|don't worry)\b/i.test(text);
      const upbeat = /\b(hi|hello|welcome|great|nice|well done|excellent|you did it)\b/i.test(text);
      utterance.rate = reassuring ? .91 : upbeat ? 1.01 : .96;
      utterance.pitch = reassuring ? 1.01 : upbeat ? 1.1 : 1.05;
      utterance.volume = 1;
      return utterance;
    }
  };
})();
