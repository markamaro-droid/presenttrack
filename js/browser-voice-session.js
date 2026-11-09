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
      this.audio = options.tts || globalThis.TracyAudio;
      this.run = null; this.state = 'idle'; this.speakerMuted = false;
      this.history = []; this.messages = []; this.conversationOwner = null;
      this.handsFree = true; this.language = 'auto'; this.voice = 'natural';
    }
    get active() { return !!this.run; }
    get voiceActive() { return !!this.run?.voiceActive; }
    get owner() { return this.run?.owner; }
    stateChanged(state, message) {
      this.state = state;
      this.options.onState?.({ state, message, active: this.active, voiceActive: this.voiceActive, micMuted: !!this.run?.micMuted, speakerMuted: this.speakerMuted, handsFree: this.handsFree });
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
        if (this.conversationOwner && this.conversationOwner !== run.owner) {
          this.history.length = 0; this.messages.length = 0;
          this.options.onReset?.();
          throw new SafeError(errors.unauthorized);
        }
        this.conversationOwner = run.owner;
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
    async start(language = this.language) {
      if (this.voiceActive) return;
      if (this.active) this.stop();
      this.setLanguage(language);
      if (globalThis.navigator?.onLine === false) { this.stateChanged('error', 'You are offline. Reconnect and retry.'); return; }
      if (!this.Recognition) { this.stateChanged('error', 'Voice input is unavailable in this browser. You can still type below, or use Chrome or Edge on HTTPS.'); return; }
      const run = this.newRun(true);
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
    newRun(voiceActive) {
      return { history: this.history, voiceActive, micMuted: false, turns: 0, language: this.language === 'fil-PH' || this.language === 'taglish' ? 'fil-PH' : 'en-US' };
    }
    setLanguage(value) {
      this.language = ['auto', 'en-US', 'fil-PH', 'taglish'].includes(value) ? value : 'auto';
      if (this.run) this.run.language = ['fil-PH', 'taglish'].includes(this.language) ? 'fil-PH' : 'en-US';
    }
    setVoice(value) { this.voice = value || 'natural'; }
    setHandsFree(value) { this.handsFree = !!value; }
    append(role, content) {
      const message = { role, content }; this.messages.push(message);
      if (this.messages.length > 100) this.messages.shift();
      this.options.onMessage?.(message);
    }
    async sendText(text) {
      const message = String(text || '').trim();
      if (!message || message.length > 2000) return false;
      if (globalThis.navigator?.onLine === false) { this.stateChanged('error', 'You are offline. Reconnect and retry.'); return false; }
      let run = this.run;
      if (run) {
        run.turn = null; run.request?.abort(); clearTimeout(run.requestTimer);
        this.clearRecognition(run); this.cancelSpeech(run); clearTimeout(run.restartTimer);
      } else this.run = run = this.newRun(false);
      return this.reply(run, message);
    }
    finishTurn(run) {
      if (this.run !== run) return;
      run.turn = null;
      if (!run.voiceActive) { this.stop('Ready for your next message'); return; }
      if (!this.handsFree) run.micMuted = true;
      this.listen(run);
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
      if (this.options.canListen && !this.options.canListen()) { this.stop('Microphone off while presentation recording or evaluation is in use.'); return; }
      if (!run.voiceActive) { this.stop('Ready for your next message'); return; }
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
      this.clearRecognition(run);
      clearTimeout(run.idleTimer); run.idleTimer = null;
      this.stateChanged('thinking', 'Microphone paused — Tracy is thinking…');
      const turn = run.turn = {};
      try {
        this.append('user', message);
        this.options.onCaption?.('user', '');
        const data = await this.request(run, { message, history: run.history, context: this.options.getContext?.() || {}, language: this.language });
        if (this.run !== run || run.turn !== turn) return;
        if (typeof data.reply !== 'string' || !data.reply.trim()) throw new SafeError('Tracy could not generate a reply. Please retry.');
        run.turns++;
        run.history.push({ role: 'user', content: message }, { role: 'assistant', content: data.reply.slice(0, 6000) });
        while (run.history.length > 8 || run.history.reduce((sum, item) => sum + item.content.length, 0) > 12000) run.history.splice(0, 2);
        this.options.onCaption?.('assistant', data.reply);
        this.append('assistant', data.reply.slice(0, 6000));
        if (this.language === 'auto') run.language = /\b(ang|mga|iyong|ako|ikaw|naman|salamat|kumusta|maaari|paano|magandang)\b/i.test(data.reply) ? 'fil-PH' : 'en-US';
        this.speak(run, data.reply);
        return true;
      } catch (error) {
        if (this.run === run && run.turn === turn) this.fail(error instanceof SafeError ? error.message : 'Tracy could not reach the AI service. Please retry.');
        return false;
      }
    }
    cancelSpeech(run) {
      run.audioMarker = null;
      run.audio?.cancel(); run.audio = null;
      if (run.utterance) { run.utterance.onend = run.utterance.onerror = null; run.utterance = null; this.synth.cancel(); }
      clearTimeout(run.speechTimer);
    }
    speak(run, text) {
      if (this.run !== run) return;
      if (this.speakerMuted) { this.finishTurn(run); return; }
      this.cancelSpeech(run); run.pendingSpeech = text;
      if (this.audio && this.voice === 'natural') {
        this.stateChanged('thinking', 'Preparing Tracy’s voice — microphone paused');
        const marker = {}; run.audioMarker = marker;
        const current = () => this.run === run && run.audioMarker === marker && !!run.audio;
        run.audio = this.audio.speak(text, { language: run.language,
          onstart: () => { if (current()) this.stateChanged('speaking', 'Tracy is speaking. Use Stop speaking to interrupt.'); },
          onpause: () => { if (current()) this.stateChanged('thinking', 'Audio buffering — microphone paused'); },
          onend: () => { if (current()) { run.audio = null; run.pendingSpeech = null; this.finishTurn(run); } },
          onerror: () => { if (current()) { run.audio = null; this.stateChanged('playback', 'Voice unavailable or playback blocked. Read the reply, choose another voice, or tap Enable audio to retry.'); } }
        });
        return;
      }
      if (!this.synth || !this.Utterance) { this.stateChanged('playback', 'Spoken audio is unavailable. You can read the reply or choose another voice.'); return; }
      const utterance = run.utterance = new this.Utterance(text);
      utterance.lang = run.language;
      const voices = this.synth.getVoices();
      utterance.voice = voices.find(v => v.lang === run.language) || voices.find(v => v.lang.startsWith(run.language.split('-')[0])) || null;
      globalThis.TracySpeech?.configure(utterance, this.synth, run.language);
      const selected = voices.find(v => v.voiceURI === this.voice);
      if (selected) { utterance.voice = selected; utterance.lang = selected.lang; }
      this.stateChanged('speaking', 'Microphone paused — Tracy is speaking. Tap Interrupt to talk.');
      const current = () => this.run === run && run.utterance === utterance;
      utterance.onend = () => { if (current()) { run.utterance = null; clearTimeout(run.speechTimer); run.pendingSpeech = null; this.finishTurn(run); } };
      utterance.onerror = () => { if (current()) { this.cancelSpeech(run); this.stateChanged('playback', 'Tap Enable audio to hear Tracy — microphone paused'); } };
      this.arm(run, 'speechTimer', 90000, () => { this.cancelSpeech(run); this.stateChanged('playback', 'Audio did not finish. Tap Enable audio or Interrupt.'); });
      try { this.synth.resume?.(); this.synth.speak(utterance); } catch { utterance.onerror(); }
    }
    interrupt(listen = true) {
      const run = this.run; if (!run || !['speaking', 'thinking', 'playback'].includes(this.state)) return;
      run.turn = null; run.request?.abort(); clearTimeout(run.requestTimer);
      this.cancelSpeech(run); run.pendingSpeech = null;
      if (listen && run.voiceActive) this.listen(run); else this.finishTurn(run);
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
      if (muted && this.run && (this.run.pendingSpeech || ['speaking', 'playback'].includes(this.state))) this.interrupt(false);
    }
    enablePlayback() { if (this.run?.pendingSpeech) this.speak(this.run, this.run.pendingSpeech); }
    fail(message) { this.stop(message, true); }
    stop(message = 'Microphone off — conversation ended', error = false) {
      const run = this.run; this.run = null;
      if (run) {
        run.request?.abort(); this.clearRecognition(run); this.cancelSpeech(run);
        for (const key of ['setupTimer', 'requestTimer', 'sessionTimer', 'idleTimer', 'restartTimer', 'speechTimer']) clearTimeout(run[key]);
        run.pendingSpeech = null;
      }
      this.options.onCaption?.('user', ''); this.options.onCaption?.('assistant', '');
      this.stateChanged(error ? 'error' : 'idle', message);
    }
    clear() { this.stop(); this.history.length = 0; this.messages.length = 0; this.conversationOwner = null; this.options.onReset?.(); }
  }
  globalThis.TracyBrowserVoiceSession = TracyBrowserVoiceSession;
})();
