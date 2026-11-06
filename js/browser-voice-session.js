/* Browser speech + authenticated Groq replies. Conversation stays in memory only. */
(() => {
  const errors = {
    unauthorized: 'Please sign in again to talk with Tracy.',
    setup_required: 'Tracy is not configured yet. The site owner needs to check the AI provider and Supabase settings.',
    quota_unavailable: 'Tracy cannot check usage right now. Please try again later.',
    provider_access: 'Tracy’s AI provider access needs attention from the site owner.',
    provider_configuration: 'Tracy’s AI model configuration needs attention from the site owner.',
    provider_blocked: 'Tracy could not answer that request. Try rephrasing your presentation question.',
    provider_busy: 'Tracy’s AI service is unavailable. Please try again shortly.'
  };
  class SafeError extends Error {}
  class TracyBrowserVoiceSession {
    constructor(options) {
      this.options = options;
      this.fetch = options.fetchImpl || globalThis.fetch.bind(globalThis);
      this.Recognition = options.Recognition || globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
      this.synth = options.synth || globalThis.speechSynthesis;
      this.Utterance = options.Utterance || globalThis.SpeechSynthesisUtterance;
      this.run = null; this.state = 'idle'; this.speakerMuted = false;
    }
    get active() { return !!this.run; }
    get owner() { return this.run?.owner; }
    stateChanged(state, message) {
      this.state = state;
      this.options.onState?.({ state, message, active: this.active, micMuted: !!this.run?.micMuted });
    }
    arm(run, name, ms, fn) {
      clearTimeout(run[name]);
      run[name] = setTimeout(() => { if (this.run === run) fn(); }, ms);
    }
    async request(run, body) {
      const controller = run.request = new AbortController();
      this.arm(run, 'requestTimer', 55000, () => this.fail('Tracy’s request took too long. Please retry.'));
      try {
        const session = await this.options.getSession();
        if (this.run !== run || controller.signal.aborted) throw new SafeError('Conversation ended.');
        if (!session?.access_token || !session.user?.id || (run.owner && run.owner !== session.user.id)) throw new SafeError(errors.unauthorized);
        run.owner = session.user.id;
        const response = await this.fetch('/api/coach', {
          method: 'POST', cache: 'no-store', signal: controller.signal,
          headers: { Authorization: 'Bearer ' + session.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify(body)
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          const minutes = Math.ceil(Math.max(1, Math.min(86400, Number(response.headers.get('Retry-After')) || 60)) / 60);
          throw new SafeError(['groq_limit', 'provider_limit'].includes(data.error) ? `Tracy has reached ${data.error === 'groq_limit' ? 'Groq’s service' : 'the available AI services’'} limit. Retry in about ${minutes} minute(s); daily limits may take longer to reset.` :
            response.status === 429 ? `Your conversation limit was reached. Retry in about ${minutes} minute(s).` :
            response.status === 404 ? 'Tracy’s new voice service has not been deployed yet.' : errors[data.error] || 'Tracy could not reply. Please try again shortly.');
        }
        return data;
      } finally { if (run.request === controller) clearTimeout(run.requestTimer); }
    }
    async start(language = 'en-US') {
      if (this.active) return;
      if (globalThis.navigator?.onLine === false) { this.stateChanged('error', 'You are offline. Reconnect and retry.'); return; }
      if (!this.Recognition || !this.synth || !this.Utterance) { this.stateChanged('error', 'This browser does not support voice conversations. Try Chrome or Edge on HTTPS.'); return; }
      const run = { history: [], micMuted: false, turns: 0, language: ['en-US', 'fil-PH'].includes(language) ? language : 'en-US' };
      this.run = run;
      this.stateChanged('connecting', 'Checking your sign-in and voice access…');
      this.arm(run, 'setupTimer', 45000, () => this.fail('Voice setup took too long. Check microphone permission and retry.'));
      try {
        const data = await this.request(run, { action: 'start' });
        if (this.run !== run) return;
        if (data.ready !== true) throw new SafeError('Tracy’s voice setup failed. Please retry.');
        this.arm(run, 'sessionTimer', 600000, () => this.stop('Your 10-minute conversation has ended.'));
        this.listen(run);
      } catch (error) { if (this.run === run) this.fail(error instanceof SafeError ? error.message : 'Tracy could not reach the voice service. Check your connection and retry.'); }
    }
    clearRecognition(run) {
      const recognition = run.recognition; run.recognition = null;
      if (recognition) {
        recognition.onstart = recognition.onresult = recognition.onerror = recognition.onend = null;
        try { recognition.abort(); } catch {}
      }
      clearTimeout(run.listenTimer);
    }
    listen(run) {
      if (this.run !== run) return;
      if (run.turns >= 20) { this.stop('This conversation has reached 20 replies. Start a new one when ready.'); return; }
      if (run.micMuted) { this.stateChanged('muted', 'Microphone muted'); return; }
      this.clearRecognition(run);
      const recognition = run.recognition = new this.Recognition();
      recognition.lang = run.language; recognition.continuous = false; recognition.interimResults = true;
      let transcript = '';
      const current = () => this.run === run && run.recognition === recognition;
      this.stateChanged('permission', 'Waiting for the microphone…');
      this.arm(run, 'listenTimer', 45000, () => this.fail('The microphone did not respond. Check its permission and retry.'));
      if (!run.idleTimer) this.arm(run, 'idleTimer', 90000, () => this.stop('Conversation ended after a quiet moment.'));
      recognition.onstart = () => {
        if (!current()) return;
        clearTimeout(run.setupTimer); clearTimeout(run.listenTimer);
        this.stateChanged('listening', 'Microphone on — speak, then pause for Tracy');
      };
      recognition.onresult = event => {
        if (!current()) return;
        let preview = '';
        for (let i = 0; i < event.results.length; i++) {
          preview += event.results[i][0].transcript + ' ';
        }
        this.options.onCaption?.('user', preview.trim().slice(0, 2000));
        transcript = Array.from(event.results).filter(result => result.isFinal).map(result => result[0].transcript).join(' ').trim().slice(0, 2000);
        if (transcript) recognition.stop();
      };
      recognition.onerror = event => {
        if (!current() || ['no-speech', 'aborted'].includes(event.error)) return;
        const messages = { 'not-allowed': 'Microphone access was blocked. Allow it in browser site settings and retry.',
          'service-not-allowed': 'Your browser’s speech recognition service is unavailable. Try another supported browser.',
          'audio-capture': 'Your microphone is unavailable. Check the device and retry.',
          'network': 'The browser’s speech recognition service could not connect. Check your network and retry.',
          'language-not-supported': 'Speech recognition does not support this language here. Try English.' };
        this.fail(messages[event.error] || 'Speech recognition failed. Please retry.');
      };
      recognition.onend = () => {
        if (!current()) return;
        this.clearRecognition(run);
        if (transcript) this.reply(run, transcript);
        else this.arm(run, 'restartTimer', 300, () => this.listen(run));
      };
      try { recognition.start(); } catch { this.fail('The microphone could not start. Check browser permissions and retry.'); }
    }
    async reply(run, message) {
      clearTimeout(run.idleTimer); run.idleTimer = null;
      this.stateChanged('thinking', 'Microphone paused — Tracy is thinking…');
      const turn = run.turn = {};
      try {
        const data = await this.request(run, { message, history: run.history });
        if (this.run !== run || run.turn !== turn) return;
        if (typeof data.reply !== 'string' || !data.reply.trim()) throw new SafeError('Tracy could not generate a reply. Please retry.');
        run.turns++;
        run.history.push({ role: 'user', content: message }, { role: 'assistant', content: data.reply.slice(0, 6000) });
        while (run.history.length > 8 || run.history.reduce((sum, item) => sum + item.content.length, 0) > 12000) run.history.splice(0, 2);
        this.options.onCaption?.('assistant', data.reply);
        this.speak(run, data.reply);
      } catch (error) {
        if (this.run === run && run.turn === turn) this.fail(error instanceof SafeError ? error.message : 'Tracy could not reach the AI service. Please retry.');
      }
    }
    cancelSpeech(run) {
      if (run.utterance) { run.utterance.onend = run.utterance.onerror = null; run.utterance = null; this.synth.cancel(); }
      clearTimeout(run.speechTimer);
    }
    speak(run, text) {
      if (this.run !== run) return;
      if (this.speakerMuted) { this.listen(run); return; }
      this.cancelSpeech(run); run.pendingSpeech = text;
      const utterance = run.utterance = new this.Utterance(text);
      utterance.lang = run.language;
      const voices = this.synth.getVoices();
      utterance.voice = voices.find(v => v.lang === run.language) || voices.find(v => v.lang.startsWith(run.language.split('-')[0])) || null;
      this.stateChanged('speaking', 'Microphone paused — Tracy is speaking. Tap Interrupt to talk.');
      const current = () => this.run === run && run.utterance === utterance;
      utterance.onend = () => { if (current()) { run.utterance = null; clearTimeout(run.speechTimer); run.pendingSpeech = null; this.listen(run); } };
      utterance.onerror = () => { if (current()) { this.cancelSpeech(run); this.stateChanged('playback', 'Tap Enable audio to hear Tracy — microphone paused'); } };
      this.arm(run, 'speechTimer', 90000, () => { this.cancelSpeech(run); this.stateChanged('playback', 'Audio did not finish. Tap Enable audio or Interrupt.'); });
      try { this.synth.resume?.(); this.synth.speak(utterance); } catch { utterance.onerror(); }
    }
    interrupt() {
      const run = this.run; if (!run || !['speaking', 'thinking', 'playback'].includes(this.state)) return;
      run.turn = null; run.request?.abort(); clearTimeout(run.requestTimer);
      this.cancelSpeech(run); run.pendingSpeech = null;
      this.listen(run);
    }
    muteMicrophone(muted) {
      const run = this.run; if (!run) return;
      run.micMuted = muted;
      if (muted) this.clearRecognition(run);
      if (['thinking', 'speaking', 'playback'].includes(this.state)) this.stateChanged(this.state, muted ? 'Microphone muted' : 'Microphone will resume after Tracy’s reply');
      else if (muted) this.stateChanged('muted', 'Microphone muted');
      else this.listen(run);
    }
    muteSpeaker(muted) {
      this.speakerMuted = muted;
      if (muted && this.run && ['speaking', 'playback'].includes(this.state)) this.interrupt();
    }
    enablePlayback() { if (this.run?.pendingSpeech) this.speak(this.run, this.run.pendingSpeech); }
    fail(message) { this.stop(message, true); }
    stop(message = 'Microphone off — conversation ended', error = false) {
      const run = this.run; this.run = null;
      if (run) {
        run.request?.abort(); this.clearRecognition(run); this.cancelSpeech(run);
        for (const key of ['setupTimer', 'requestTimer', 'sessionTimer', 'idleTimer', 'restartTimer', 'speechTimer']) clearTimeout(run[key]);
        run.history.length = 0; run.pendingSpeech = null;
      }
      this.options.onCaption?.('user', ''); this.options.onCaption?.('assistant', '');
      this.stateChanged(error ? 'error' : 'idle', message);
    }
  }
  globalThis.TracyBrowserVoiceSession = TracyBrowserVoiceSession;
})();
