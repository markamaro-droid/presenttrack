/* One session for typed and spoken conversation; the existing robot owns animation. */
(() => {
  const $ = id => document.getElementById(id);
  const bot = $('bot'), panel = $('tracy-voice'), start = $('tracy-start'), end = $('tracy-end');
  const mic = $('tracy-mic'), interrupt = $('tracy-interrupt'), status = $('tracy-status'), playback = $('tracy-play');
  const voice = $('tracy-voice-select'), language = $('tracy-language'), captions = $('tracy-captions');
  const history = $('tracy-history'), input = $('tracy-input'), speaker = $('tracy-speaker');
  let hooks = {}, requestedOwner = null, draftVersion = 0, encouraging = false, lastState = { state: 'idle', active: false, micMuted: false };
  const available = () => !['eval', 'assess'].includes(window.podium?.ext?.S.view) && !window.PTPracticeAudio?.capturing;
  const empty = $('tracy-empty');
  function resetHistory() { history.replaceChildren(empty); empty.hidden = false; }
  function append(message) {
    empty.hidden = true;
    const row = document.createElement('article'), name = document.createElement('b'), text = document.createElement('p');
    row.className = 'tracy-message'; row.dataset.role = message.role;
    name.textContent = message.role === 'user' ? 'You' : 'Tracy'; text.textContent = message.content;
    row.append(name, text); history.append(row);
    while (history.children.length > 101) history.children[1].remove();
    history.scrollTop = history.scrollHeight;
  }
  const session = new TracyBrowserVoiceSession({
    audio: $('tracy-audio'), canListen: available, getContext: () => window.TracyContext?.snapshot() || {},
    getSession: async () => {
      const cloud = window.PTCloud;
      if (!cloud?.enabled || !cloud.user?.id || !available()) return null;
      const owner = cloud.user.id;
      const { data, error } = await cloud.client.auth.getSession();
      return !error && owner === cloud.user?.id && owner === requestedOwner && data?.session?.user?.id === owner ? data.session : null;
    },
    onState: state => {
      lastState = state; status.textContent = state.message;
      const voiceOn = state.voiceActive ?? state.active;
      bot.dataset.voiceState = state.state;
      panel.dataset.state = state.state;
      panel.dataset.mic = voiceOn && !state.micMuted && state.state === 'listening' ? 'on' : 'off';
      start.hidden = voiceOn; start.textContent = state.state === 'error' ? 'Retry microphone' : 'Turn on mic';
      end.hidden = !voiceOn; mic.hidden = !voiceOn;
      mic.disabled = ['connecting', 'permission'].includes(state.state);
      mic.textContent = state.micMuted ? 'Resume mic' : 'Pause mic'; mic.setAttribute('aria-pressed', String(state.micMuted));
      $('tracy-mic-status').textContent = !voiceOn ? 'Microphone off' : state.micMuted ? 'Microphone paused' : state.state === 'listening' ? 'Microphone on' : 'Microphone paused during reply';
      interrupt.hidden = !['thinking', 'speaking', 'playback'].includes(state.state);
      interrupt.textContent = state.state === 'thinking' ? 'Cancel reply' : 'Stop speaking';
      playback.hidden = state.state !== 'playback';
      language.disabled = voiceOn; voice.disabled = state.state === 'speaking';
      $('tracy-send').disabled = ['thinking', 'connecting', 'permission'].includes(state.state);
      hooks.state?.(state);
      if (state.state === 'speaking' && encouraging) hooks.encourage?.();
    },
    onMessage: message => { append(message); encouraging = message.role === 'assistant' && /\b(well done|great job|you can do|you've got|congratulations|kaya mo|magaling)\b/i.test(message.content); }, onReset: resetHistory,
    onCaption: (who, text) => { $(who === 'user' ? 'tracy-user-caption' : 'tracy-reply-caption').textContent = text ? (who === 'user' ? 'You: ' : 'Tracy: ') + text : ''; }
  });
  function open() { panel.hidden = false; panel.scrollTop = 0; $('bvoice').setAttribute('aria-expanded', 'true'); window.podium?.tourPause?.(); panel.focus(); }
  function close() { stop(); panel.hidden = true; $('bvoice').setAttribute('aria-expanded', 'false'); }
  function toggle() { if (panel.hidden) open(); else close(); }
  function prepare() {
    if (!available()) { status.textContent = 'Finish your evaluation or practice recording and open another page to talk with Tracy.'; return false; }
    const owner = window.PTCloud?.user?.id || null;
    if (requestedOwner && requestedOwner !== owner) session.clear();
    requestedOwner = owner;
    hooks.prepare?.();
    session.setLanguage?.(language.value);
    session.setHandsFree?.($('tracy-handsfree').checked);
    session.setVoice?.(voice.value);
    return true;
  }
  async function begin() { open(); if (prepare()) await session.start(language.value); }
  async function send(event) {
    event?.preventDefault();
    const text = input.value.trim(); if (!text || $('tracy-send').disabled || !prepare()) return;
    const version = ++draftVersion, owner = requestedOwner;
    input.value = ''; const ok = await session.sendText(text);
    if (!ok && version === draftVersion && owner === requestedOwner && !input.value) input.value = text;
  }
  function stop(message) { session.stop(message); }
  function setSpeaker(on) {
    session.muteSpeaker(!on); speaker.textContent = on ? 'Mute voice' : 'Unmute voice'; speaker.setAttribute('aria-pressed', String(!on));
  }
  window.PTVoice = {
    start: begin, open, close, toggle, stop, interrupt: () => session.interrupt(), setSpeaker,
    setHooks: value => { hooks = value; hooks.state?.(lastState); },
    get active() { return session.active; }, get state() { return session.state; }
  };
  start.addEventListener('click', begin); $('bvoice').addEventListener('click', toggle);
  $('tracy-close').addEventListener('click', () => { close(); $('bc').focus(); });
  end.addEventListener('click', () => stop());
  mic.addEventListener('click', () => session.muteMicrophone(!lastState.micMuted));
  interrupt.addEventListener('click', () => session.interrupt());
  playback.addEventListener('click', () => session.enablePlayback());
  speaker.addEventListener('click', () => { const on = speaker.getAttribute('aria-pressed') === 'true'; if (window.podium?.setVoice) window.podium.setVoice(on); else setSpeaker(on); });
  $('tracy-form').addEventListener('submit', send);
  input.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); send(); } });
  $('tracy-handsfree').addEventListener('change', event => session.setHandsFree(event.target.checked));
  language.addEventListener('change', () => session.setLanguage(language.value));
  voice.addEventListener('change', () => session.setVoice(voice.value));
  $('tracy-clear').addEventListener('click', () => { draftVersion++; session.clear(); input.value = ''; });
  captions.addEventListener('change', () => { $('tracy-caption-lines').hidden = !captions.checked; });
  function voices() {
    const selected = voice.value || 'natural';
    const entries = [['natural', 'Tracy · natural voice'], ...(window.speechSynthesis?.getVoices() || []).map(v => [v.voiceURI, `${v.name} (${v.lang})`])];
    voice.replaceChildren(...entries.map(([value, name]) => { const option = document.createElement('option'); option.value = value; option.textContent = name; return option; }));
    voice.value = entries.some(([value]) => value === selected) ? selected : 'natural';
    session.setVoice?.(voice.value);
  }
  voices(); window.speechSynthesis?.addEventListener('voiceschanged', voices);
  panel.addEventListener('keydown', event => { if (event.key === 'Escape') { event.stopPropagation(); close(); $('bc').focus(); } });
  window.addEventListener('offline', () => { if (session.active) session.fail('You are offline. Reconnect and try again.'); });
  window.addEventListener('pagehide', () => session.clear());
  document.addEventListener('visibilitychange', () => { if (document.hidden && session.active) stop('Microphone off — the tab was hidden. Start again when ready.'); });
  window.PTCloud?.client?.auth.onAuthStateChange((_event, auth) => {
    if ((requestedOwner || session.messages?.length) && auth?.user?.id !== requestedOwner) { draftVersion++; close(); session.clear(); input.value = ''; requestedOwner = null; }
  });
  new MutationObserver(() => { if (bot.hidden && !panel.hidden) close(); }).observe(bot, { attributes: true, attributeFilter: ['hidden'] });
})();
