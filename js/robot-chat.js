/* Text and voice share one authenticated conversation. No localStorage or student records. */
(() => {
  const $ = id => document.getElementById(id);
  const panel = $('robot-chat'), log = $('robot-chat-log'), form = $('robot-chat-form');
  const input = $('robot-chat-input'), sendButton = $('robot-chat-send'), status = $('robot-chat-status');
  const toggle = $('bchat');
  let history = [], owner = null, pending = null, generation = 0, hooks = {};
  const scroll = () => { log.scrollTop = log.scrollHeight; };
  function row(who, text) {
    const item = document.createElement('p');
    item.className = 'robot-chat-message ' + who;
    // AI output and user input are always text, never HTML.
    item.textContent = (who === 'user' ? 'You: ' : 'PresentTrack AI: ') + text;
    log.appendChild(item);
    while (log.children.length > 60) log.firstElementChild.remove();
    scroll();
    return item;
  }
  function busy(on) {
    input.disabled = sendButton.disabled = on;
    form.setAttribute('aria-busy', String(on));
    hooks.busy?.(on);
  }
  function close() { panel.hidden = true; toggle.setAttribute('aria-expanded', 'false'); }
  function open(focus = true) {
    panel.hidden = false; toggle.setAttribute('aria-expanded', 'true');
    window.podium?.tourPause?.();
    if (focus && !pending) input.focus();
    scroll();
  }
  function cancel() {
    generation++;
    if (pending) { pending.abort(); pending = null; }
    busy(false); status.textContent = '';
  }
  function reset() {
    cancel(); history = []; log.replaceChildren(); input.value = ''; close();
    hooks.reset?.();
  }
  function context(message) {
    let recent = history.slice(-12);
    while (recent.length && recent.reduce((n, x) => n + x.content.length, message.length) > 16000) recent = recent.slice(2);
    return recent;
  }
  async function send(value) {
    if (pending) return; // Lock before even obtaining/refreshing the session.
    const message = String(value || '').trim();
    if (!message || message.length > 2000) { status.textContent = 'Enter a message of 1–2,000 characters.'; return; }
    const cloud = window.PTCloud;
    const userId = cloud?.user?.id;
    if (owner !== userId) { reset(); owner = userId || null; }
    open(false);
    // Existing navigation and tour controls also work in the app's offline demo mode.
    const command = hooks.command?.(message);
    if (command) {
      row('user', message); input.value = ''; status.textContent = '';
      if (command.say) row('bot', command.say);
      if (command.tour) close();
      if (!command.quiet && command.say) hooks.reply?.(command.say);
      return;
    }
    if (!cloud?.enabled || !userId || !cloud.client) { status.textContent = 'Please sign in with your PresentTrack account to chat.'; return; }
    if (location.protocol === 'file:') { status.textContent = 'Open PresentTrack through the local development server or the deployed website to chat.'; return; }
    const mine = ++generation, controller = new AbortController(); pending = controller;
    busy(true); status.textContent = 'PresentTrack AI is typing…'; hooks.start?.();
    let submitted = false, timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 50000);
    const current = () => mine === generation && cloud.user?.id === userId && owner === userId;
    try {
      const interrupted = new Promise((_, reject) => controller.signal.addEventListener('abort',
        () => reject(new Error('Chat took too long. Please try again.')), { once: true }));
      const { data, error } = await Promise.race([cloud.client.auth.getSession(), interrupted]);
      if (!current()) return;
      if (error || !data?.session?.access_token || data.session.user?.id !== userId) throw new Error('Please sign in again to chat.');
      if (controller.signal.aborted) throw new Error('Chat took too long. Please try again.');
      row('user', message); input.value = ''; submitted = true;
      const response = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + data.session.access_token },
        body: JSON.stringify({ message, history: context(message) }), signal: controller.signal, cache: 'no-store'
      });
      if (!current()) return;
      if (!response.ok) {
        const wait = Math.max(1, Math.min(86400, Number(response.headers.get('Retry-After')) || 60));
        const errors = {
          400: 'That message could not be sent. Try a shorter message or start a new chat.',
          401: 'Please sign in again to chat.', 413: 'That message is too long. Please shorten it.',
          429: 'Chat limit reached. Try again in about ' + Math.ceil(wait / 60) + ' minute(s).',
          404: 'Chat is not available on this server yet.',
          502: 'The AI could not reply. Please try again.', 503: 'Chat is temporarily unavailable. Please try again later.'
        };
        throw new Error(errors[response.status] || 'Chat could not reply. Please try again.');
      }
      const result = await response.json();
      if (!current()) return;
      if (typeof result.reply !== 'string' || !result.reply.trim() || result.reply.length > 6000) throw new Error('The AI could not reply. Please try again.');
      history = [...context(message), { role: 'user', content: message }, { role: 'assistant', content: result.reply }].slice(-12);
      row('bot', result.reply); status.textContent = ''; hooks.reply?.(result.reply);
    } catch (error) {
      if (!current()) return;
      status.textContent = timedOut ? 'Chat took too long. Please try again.' :
        error instanceof TypeError || error instanceof SyntaxError ? 'Connection problem. Please try again.' : error.message || 'Chat could not reply. Please try again.';
      if (submitted) input.value = message; // Keep failed messages available for retry; do not add them to context.
      hooks.error?.();
    } finally {
      clearTimeout(timer);
      if (mine === generation) { pending = null; busy(false); if (!panel.hidden) input.focus(); }
    }
  }
  window.PTRobotChat = { send, open, close, cancel, reset, setHooks: value => { hooks = value; }, get busy() { return !!pending; } };
  form.addEventListener('submit', event => { event.preventDefault(); send(input.value); });
  toggle.addEventListener('click', () => panel.hidden ? open() : close());
  $('robot-chat-close').addEventListener('click', () => { close(); toggle.focus(); });
  $('robot-chat-clear').addEventListener('click', () => { reset(); open(); });
  panel.addEventListener('keydown', event => { if (event.key === 'Escape') { event.stopPropagation(); close(); toggle.focus(); } });
  window.PTCloud?.client?.auth.onAuthStateChange((_event, session) => {
    const id = session?.user?.id || null;
    if (id !== owner) { owner = id; reset(); }
  });
})();
