/* Compact voice controls for the existing robot. No text input or persistent history. */
(() => {
  const $ = id => document.getElementById(id);
  const bot = $('bot'), panel = $('tracy-voice'), start = $('tracy-start'), end = $('tracy-end');
  const mic = $('tracy-mic'), interrupt = $('tracy-interrupt'), status = $('tracy-status'), playback = $('tracy-play');
  const voice = $('tracy-voice-select'), captions = $('tracy-captions');
  let hooks = {}, requestedOwner = null, lastState = { state: 'idle', message: 'Microphone off — ready when you are', active: false, micMuted: false };
  const session = new TracyBrowserVoiceSession({
    audio: $('tracy-audio'),
    getSession: async () => {
      const cloud = window.PTCloud;
      if (!cloud?.enabled || !cloud.user?.id) return null;
      const owner = cloud.user.id;
      // Do not capture evaluation audio in an AI conversation.
      if (['eval', 'assess'].includes(window.podium?.ext?.S.view)) return null;
      const { data, error } = await cloud.client.auth.getSession();
      return !error && owner === cloud.user?.id && owner === requestedOwner && data?.session?.user?.id === owner ? data.session : null;
    },
    onState: state => {
      lastState = state; status.textContent = state.message;
      bot.dataset.voiceState = state.active ? state.state : state.state === 'error' ? 'error' : 'idle';
      panel.dataset.state = state.state;
      panel.dataset.mic = state.active && !state.micMuted && state.state === 'listening' ? 'on' : 'off';
      start.hidden = state.active; start.textContent = state.state === 'error' ? 'Retry conversation' : 'Start conversation';
      end.hidden = !state.active;
      mic.hidden = !state.active; mic.disabled = ['connecting', 'permission'].includes(state.state);
      mic.textContent = state.micMuted ? 'Unmute mic' : 'Mute mic'; mic.setAttribute('aria-pressed', String(state.micMuted));
      $('tracy-mic-status').textContent = !state.active ? 'Microphone off' : state.micMuted ? 'Microphone muted' : state.state === 'listening' ? 'Microphone on' : 'Microphone paused';
      interrupt.hidden = !state.active; interrupt.disabled = !['thinking', 'speaking', 'playback'].includes(state.state);
      playback.hidden = state.state !== 'playback'; voice.disabled = state.active;
      hooks.state?.(state);
    },
    onCaption: (who, text) => { $(who === 'user' ? 'tracy-user-caption' : 'tracy-reply-caption').textContent = text ? (who === 'user' ? 'You: ' : 'Tracy: ') + text : ''; const lines = $('tracy-caption-lines'); lines.scrollTop = lines.scrollHeight; }
  });
  function open() { panel.hidden = false; panel.scrollTop = 0; $('bvoice').setAttribute('aria-expanded', 'true'); window.podium?.tourPause?.(); $('tracy-close').focus(); }
  async function begin() {
    open();
    if (['eval', 'assess'].includes(window.podium?.ext?.S.view)) { status.textContent = 'Finish your evaluation and open another page to talk with Tracy.'; return; }
    if (!session.active) { requestedOwner = window.PTCloud?.user?.id || null; hooks.prepare?.(); await session.start(voice.value); }
  }
  function stop(message) { session.stop(message); }
  window.PTVoice = {
    start: begin, open, stop, interrupt: () => session.interrupt(),
    setSpeaker: on => session.muteSpeaker(!on),
    setHooks: value => { hooks = value; hooks.state?.(lastState); },
    get active() { return session.active; }, get state() { return session.state; }
  };
  start.addEventListener('click', begin);
  $('bvoice').addEventListener('click', open);
  end.addEventListener('click', () => stop());
  mic.addEventListener('click', () => session.muteMicrophone(!lastState.micMuted));
  interrupt.addEventListener('click', () => session.interrupt());
  playback.addEventListener('click', () => session.enablePlayback());
  captions.addEventListener('change', () => { $('tracy-caption-lines').hidden = !captions.checked; });
  const close = () => { stop(); panel.hidden = true; $('bvoice').setAttribute('aria-expanded', 'false'); };
  $('tracy-close').addEventListener('click', () => { close(); $('bc').focus(); });
  panel.addEventListener('keydown', event => { if (event.key === 'Escape') { event.stopPropagation(); close(); $('bc').focus(); } });
  window.addEventListener('offline', () => { if (session.active) session.fail('You are offline. Reconnect and start a new conversation.'); });
  window.addEventListener('pagehide', () => { if (session.active) stop(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && session.active) stop('Microphone off — the tab was hidden. Start again when ready.'); });
  window.PTCloud?.client?.auth.onAuthStateChange((_event, auth) => {
    if (session.active && (!auth?.user?.id || auth.user.id !== requestedOwner)) close();
  });
  new MutationObserver(() => { if (bot.hidden && !panel.hidden) close(); }).observe(bot, { attributes: true, attributeFilter: ['hidden'] });
})();
