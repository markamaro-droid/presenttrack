/* Tracy's live audio lifecycle. No recordings, transcripts or tokens are persisted. */
(() => {
  const messages = {
    setup_required: 'Tracy is not set up yet. Please contact the site owner.',
    unauthorized: 'Please sign in again to talk with Tracy.',
    provider_quota: 'Tracy’s voice allowance is unavailable. Please contact the site owner.',
    provider_access: 'Tracy’s AI connection needs attention from the site owner.',
    provider_configuration: 'Tracy’s voice service needs setup by the site owner.',
    provider_busy: 'Tracy’s voice service is busy. Please try again shortly.',
    rate_limit_exceeded: 'Tracy’s voice service is busy. Please try again shortly.',
    insufficient_quota: 'Tracy’s voice allowance is unavailable. Please contact the site owner.',
    quota_unavailable: 'Tracy cannot check usage right now. Please try again shortly.'
  };
  class VoiceError extends Error {}
  class TracyVoiceSession {
    constructor(options) {
      this.options = options;
      // Browser fetch requires Window as its receiver when called as a method.
      this.fetch = options.fetchImpl || globalThis.fetch.bind(globalThis);
      this.media = options.mediaDevices || navigator.mediaDevices;
      this.Peer = options.Peer || globalThis.RTCPeerConnection;
      this.audio = options.audio;
      this.run = null; this.state = 'idle'; this.speakerMuted = false;
    }
    get active() { return !!this.run; }
    get owner() { return this.run?.owner; }
    stateChanged(state, message) {
      this.state = state;
      this.options.onState?.({ state, message, active: this.active, micMuted: !!this.run?.micMuted });
    }
    emit(event) {
      if (this.run?.channel?.readyState === 'open') this.run.channel.send(JSON.stringify(event));
    }
    arm(run, name, ms, fn) {
      clearTimeout(run[name]);
      run[name] = setTimeout(() => { if (this.run === run) fn(); }, ms);
    }
    waiting(run) {
      if (this.run !== run) return;
      clearTimeout(run.turnTimer);
      this.stateChanged(run.micMuted ? 'muted' : 'listening', run.micMuted ? 'Microphone muted' : 'Microphone on — speak to Tracy');
      this.arm(run, 'idleTimer', 90000, () => this.stop('Conversation ended after a quiet moment. Start again when ready.'));
    }
    async start(voice = 'marin') {
      if (this.active) return;
      if (globalThis.navigator?.onLine === false) { this.stateChanged('error', 'Your browser is offline. Reconnect to the internet, then retry.'); return; }
      if (!this.media?.getUserMedia || !this.Peer) { this.stateChanged('error', 'Voice needs HTTPS or localhost and a browser with microphone and WebRTC support.'); return; }
      const run = { abort: new AbortController(), voice, micMuted: false, ready: false, turns: 0, responseActive: false, playing: false, stage: 'auth' };
      run.cancelled = new Promise((_, reject) => { run.reject = reject; });
      run.cancelled.catch(() => {});
      this.run = run;
      const current = () => this.run === run;
      const wait = promise => Promise.race([promise, run.cancelled]);
      this.stateChanged('connecting', 'Checking your sign-in…');
      this.options.onCaption?.('user', ''); this.options.onCaption?.('assistant', '');
      this.arm(run, 'setupTimer', 45000, () => this.fail('The voice connection took too long. Please try again.'));
      try {
        const session = await wait(this.options.getSession());
        if (!current()) return;
        if (!session?.access_token || !session.user?.id) throw new VoiceError(messages.unauthorized);
        run.authorization = 'Bearer ' + session.access_token; run.owner = session.user.id;
        run.stage = 'microphone';
        this.stateChanged('permission', 'Allow microphone access to start talking');
        const capture = this.media.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
        // Permission prompts cannot be aborted. Stop late-granted tracks after cancellation.
        capture.then(stream => { if (!current()) stream.getTracks().forEach(track => track.stop()); }, () => {});
        run.stream = await wait(capture);
        if (!current()) return;
        const tracks = run.stream.getAudioTracks();
        if (!tracks.length) throw new VoiceError('No microphone was found. Connect one and try again.');
        tracks.forEach(track => { track.enabled = false; track.onended = () => { if (current()) this.fail('Your microphone disconnected. Reconnect it and try again.'); }; });
        this.stateChanged('connecting', 'Microphone ready — connecting Tracy…');
        run.stage = 'offer';
        const peer = run.peer = new this.Peer();
        peer.ontrack = event => {
          if (!current()) return;
          const stream = event.streams?.[0];
          if (!stream) { this.fail('Tracy’s audio could not start. Please reconnect.'); return; }
          this.audio.srcObject = stream;
          this.audio.muted = this.speakerMuted || !!run.suppressAudio;
          this.audio.play().catch(() => { if (current()) this.blockPlayback(); });
        };
        peer.onconnectionstatechange = () => {
          if (!current()) return;
          if (peer.connectionState === 'failed' || peer.connectionState === 'closed') this.fail('The voice connection ended. Please try again.');
          else if (peer.connectionState === 'disconnected') {
            tracks.forEach(track => { track.enabled = false; });
            this.stateChanged('connecting', 'Connection interrupted — microphone paused');
            this.arm(run, 'disconnectTimer', 8000, () => this.fail('Connection lost. Check your internet and start again.'));
          } else if (peer.connectionState === 'connected') {
            clearTimeout(run.disconnectTimer);
            if (run.ready && !run.blocked) { tracks.forEach(track => { track.enabled = !run.micMuted; }); this.waiting(run); }
          }
        };
        tracks.forEach(track => peer.addTrack(track, run.stream));
        const channel = run.channel = peer.createDataChannel('oai-events');
        channel.onmessage = event => { if (current()) this.handle(event.data, run); };
        channel.onerror = () => { if (current()) this.fail('Tracy’s voice connection failed. Please try again.'); };
        channel.onclose = () => { if (current()) this.fail('The voice session ended. Start a new conversation.'); };
        channel.onopen = () => {
          if (!current()) return;
          clearTimeout(run.setupTimer); run.ready = true;
          tracks.forEach(track => { track.enabled = !run.micMuted && !run.blocked; });
          if (!run.blocked) this.waiting(run);
          this.arm(run, 'sessionTimer', (run.durationSeconds || 600) * 1000, () => this.stop('Your 10-minute conversation has ended. You can start a new one.'));
        };
        const offer = await wait(peer.createOffer());
        await wait(peer.setLocalDescription(offer));
        run.stage = 'request';
        const response = await wait(this.fetch('/api/voice', {
          method: 'POST', headers: { Authorization: run.authorization, 'Content-Type': 'application/json' },
          body: JSON.stringify({ sdp: offer.sdp, voice }), signal: run.abort.signal, cache: 'no-store'
        }));
        const data = await wait(response.json().catch(() => ({})));
        if (!current()) return;
        if (!response.ok) {
          const retry = Math.ceil(Math.max(1, Math.min(86400, Number(response.headers.get('Retry-After')) || 60)) / 60);
          throw new VoiceError(response.status === 429 ? `Conversation limit reached. Try again in about ${retry} minute(s).` :
            response.status === 404 ? 'The voice service is not deployed on this website yet.' : messages[data.error] || 'Tracy could not connect. Please try again shortly.');
        }
        if (typeof data.sdp !== 'string' || !data.sdp.startsWith('v=0')) throw new VoiceError('Tracy’s voice connection failed. Please try again.');
        run.ticket = data.ticket; run.durationSeconds = Math.max(30, Math.min(600, Number(data.durationSeconds) || 600));
        run.stage = 'answer';
        await wait(peer.setRemoteDescription({ type: 'answer', sdp: data.sdp }));
      } catch (error) {
        if (!current()) return;
        const errors = { NotAllowedError: 'Microphone access was blocked. Allow it in your browser’s site settings, then retry.', NotFoundError: 'No microphone was found. Connect one and try again.', NotReadableError: 'The microphone is busy or unavailable. Close other recording apps and retry.' };
        const failures = {
          auth: 'Tracy could not verify your sign-in. Sign in again and retry.',
          microphone: 'Tracy could not open the microphone. Check your browser’s microphone settings.',
          offer: 'Your browser could not start live audio. Update your browser or try another supported browser.',
          request: 'Tracy could not reach this website’s voice endpoint. Reload the page and retry; if it continues, contact the site owner.',
          answer: 'Tracy’s live audio connection could not be established. Try another browser or network.'
        };
        // A browser, authentication or SDP error is not evidence that the internet is down.
        this.fail(errors[error.name] || (error instanceof VoiceError ? error.message :
          globalThis.navigator?.onLine === false ? 'Your browser is offline. Reconnect to the internet, then retry.' : failures[run.stage]));
      }
    }
    handle(raw, run) {
      if (this.run !== run) return;
      let event;
      try { event = JSON.parse(raw); } catch { return; }
      switch (event.type) {
        case 'input_audio_buffer.speech_started':
          if (run.micMuted || run.blocked) return;
          clearTimeout(run.idleTimer); clearTimeout(run.turnTimer);
          run.inputItem = event.item_id; run.userSpeaking = true;
          if (run.playing || run.responseActive) this.silencePlayback(run);
          this.options.onCaption?.('user', 'Listening…');
          this.stateChanged('listening', 'Listening to you…');
          break;
        case 'input_audio_buffer.speech_stopped':
          run.userSpeaking = false;
          if (!run.micMuted && !run.blocked) {
            this.stateChanged('thinking', 'Tracy is thinking…');
            this.arm(run, 'turnTimer', 45000, () => this.fail('Tracy’s reply took too long. Please reconnect.'));
          }
          break;
        case 'conversation.item.input_audio_transcription.completed':
          if (!run.inputItem || run.inputItem === event.item_id) this.options.onCaption?.('user', String(event.transcript || '').slice(-1500));
          break;
        case 'conversation.item.input_audio_transcription.failed':
          this.options.onCaption?.('user', 'Captions unavailable for this turn. Voice can continue.');
          break;
        case 'response.created':
          run.responseActive = true; run.suppressAudio = false; run.assistantText = '';
          this.audio.muted = this.speakerMuted;
          if (!run.userSpeaking && !run.blocked) this.stateChanged('thinking', 'Tracy is thinking…');
          this.arm(run, 'turnTimer', 45000, () => this.fail('Tracy’s reply took too long. Please reconnect.'));
          break;
        case 'output_audio_buffer.started':
          clearTimeout(run.turnTimer); run.playing = true;
          if (!run.suppressAudio && !run.blocked) this.stateChanged('speaking', 'Tracy is speaking — you can interrupt');
          break;
        case 'response.output_audio_transcript.delta':
          if (!run.suppressAudio) { run.assistantText = ((run.assistantText || '') + String(event.delta || '')).slice(-1500); this.options.onCaption?.('assistant', run.assistantText); }
          break;
        case 'response.done':
          run.responseActive = false;
          if (event.response?.status === 'failed') { this.fail(messages[event.response.status_details?.error?.code] || 'Tracy could not speak a reply. Please reconnect.'); return; }
          if (event.response?.status === 'completed') run.turns++;
          if (!run.playing && !run.userSpeaking && !run.blocked) this.waiting(run);
          break;
        case 'output_audio_buffer.stopped':
        case 'output_audio_buffer.cleared':
          run.playing = false;
          if (run.turns >= 20) { this.stop('This conversation has reached 20 replies. You can start a new one.'); return; }
          if (!run.userSpeaking && !run.blocked) this.waiting(run);
          break;
        case 'error':
          if (event.error?.code === 'response_cancel_not_active') return;
          this.fail(messages[event.error?.code] || 'Tracy’s voice service had a problem. Please reconnect.');
          break;
      }
    }
    silencePlayback(run) {
      run.suppressAudio = true; this.audio.muted = true;
      this.options.onCaption?.('assistant', '');
    }
    interrupt() {
      const run = this.run;
      if (!run?.ready) return;
      this.silencePlayback(run);
      if (run.responseActive) this.emit({ type: 'response.cancel' });
      this.emit({ type: 'output_audio_buffer.clear' });
      run.responseActive = false; run.playing = false;
      this.waiting(run);
    }
    muteMicrophone(muted) {
      const run = this.run;
      if (!run?.ready) return;
      run.micMuted = muted;
      run.stream.getAudioTracks().forEach(track => { track.enabled = !muted && !run.blocked; });
      if (muted) { this.emit({ type: 'input_audio_buffer.clear' }); run.userSpeaking = false; }
      if (!run.playing && !run.responseActive && !run.blocked) this.waiting(run);
      else this.stateChanged(this.state, run.blocked ? 'Tap Enable audio to hear Tracy' : 'Tracy is speaking' + (muted ? ' — microphone muted' : ''));
    }
    muteSpeaker(muted) { this.speakerMuted = muted; this.audio.muted = muted || !!this.run?.suppressAudio; }
    blockPlayback() {
      const run = this.run;
      if (!run) return;
      run.blocked = true;
      run.stream?.getAudioTracks().forEach(track => { track.enabled = false; });
      this.stateChanged('playback', 'Tap Enable audio to hear Tracy — microphone paused');
    }
    async enablePlayback() {
      const run = this.run;
      if (!run) return;
      try {
        await this.audio.play();
        if (this.run !== run) return;
        run.blocked = false;
        this.interrupt(); // Discard any unheard reply; keep conversation context consistent.
        this.emit({ type: 'input_audio_buffer.clear' });
        run.stream.getAudioTracks().forEach(track => { track.enabled = !run.micMuted; });
        this.waiting(run);
      } catch { if (this.run === run) this.fail('Audio playback is blocked. Check your browser’s sound permission and retry.'); }
    }
    fail(message) { this.stop(message, true); }
    stop(message = 'Microphone off — conversation ended', error = false) {
      const run = this.run; this.run = null;
      if (run) {
        run.abort.abort(); run.reject(new Error('ended'));
        for (const key of ['setupTimer', 'sessionTimer', 'idleTimer', 'turnTimer', 'disconnectTimer']) clearTimeout(run[key]);
        run.stream?.getTracks().forEach(track => { track.onended = null; track.stop(); });
        try { run.channel?.close(); } catch {}
        try { run.peer?.close(); } catch {}
        if (run.ticket && run.authorization) {
          this.fetch('/api/voice', { method: 'POST', headers: { Authorization: run.authorization, 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'end', ticket: run.ticket }), keepalive: true, signal: AbortSignal.timeout(6000) }).catch(() => {});
        }
      }
      this.audio.pause(); this.audio.srcObject = null;
      this.options.onCaption?.('user', ''); this.options.onCaption?.('assistant', '');
      this.stateChanged(error ? 'error' : 'idle', message);
    }
  }
  globalThis.TracyVoiceSession = TracyVoiceSession;
})();
