/* Bubble shortcuts reuse Tracy's existing conversation, tour, minimize and mute actions. */
(() => {
  const bot = document.getElementById('bot'), trigger = document.getElementById('bc');
  const bar = bot.querySelector('.bbar'), panel = document.getElementById('tracy-voice');
  const paths = {
    talk: 'M4 4h16v12H9l-5 4V4zM8 8h8M8 12h5',
    tour: 'M12 3l8 4v10l-8 4-8-4V7l8-4zM15 9l-2 4-4 2 2-4 4-2z',
    minimize: 'M5 5h14v14H5zM8 12h8',
    sound: 'M11 5L6 9H3v6h3l5 4V5zM15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14',
    muted: 'M11 5L6 9H3v6h3l5 4V5zM16 9l5 6M21 9l-5 6'
  };
  const svg = key => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${paths[key]}"/></svg>`;
  const talk = document.getElementById('bvoice'), tour = document.getElementById('bguide'), mute = document.getElementById('bmute'), mini = bar.querySelector('.bmin');
  const buttons = [talk, tour, mini, mute];
  function label(button, key, text) { button.innerHTML = svg(key) + `<span class="bubble-label">${text}</span>`; button.setAttribute('aria-label', text); button.title = text; }
  label(talk, 'talk', 'Conversation'); label(tour, 'tour', 'Guided tour'); label(mini, 'minimize', 'Minimize Tracy');
  buttons.forEach((b, i) => { b.classList.add('robot-bubble'); b.dataset.bubble = String(i); });
  bar.id = 'tracy-shortcuts'; bar.setAttribute('role', 'group'); bar.setAttribute('aria-label', 'Tracy shortcuts');
  trigger.setAttribute('aria-controls', bar.id); trigger.setAttribute('aria-label', 'Tracy. Show or hide shortcuts'); trigger.title = 'Tracy shortcuts';
  let open = false;
  function setOpen(value, focus = false) {
    if (!panel.hidden && !bot.hidden && !bot.classList.contains('welcome') && !bot.classList.contains('tourmode')) value = true;
    open = value; bot.classList.toggle('menu', value); bar.inert = !value;
    bar.setAttribute('aria-hidden', String(!value)); trigger.setAttribute('aria-expanded', String(value));
    if (value && focus) talk.focus();
  }
  function syncMute() { label(mute, podium.voiceOn === false ? 'muted' : 'sound', podium.voiceOn === false ? 'Unmute Tracy' : 'Mute Tracy'); mute.setAttribute('aria-pressed', String(podium.voiceOn === false)); }
  const setVoice = podium.setVoice;
  if (setVoice) podium.setVoice = on => { setVoice(on); syncMute(); };
  syncMute(); setOpen(false);
  trigger.addEventListener('click', () => setOpen(!open));
  trigger.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(!open, !open); } });
  buttons.forEach(b => b.addEventListener('click', () => { if (b === mute) { syncMute(); return; } if (b === talk) { setOpen(true); talk.focus(); return; } setOpen(false); }));
  document.addEventListener('pointerdown', e => { if (!bot.contains(e.target)) setOpen(false); });
  bot.addEventListener('keydown', e => { if (e.key === 'Escape' && open) { e.preventDefault(); e.stopPropagation(); if (!panel.hidden) window.PTVoice.close(); setOpen(false); trigger.focus(); } });
  new MutationObserver(() => { label(talk, 'talk', panel.hidden ? 'Open conversation' : 'Close conversation'); if (!panel.hidden) setOpen(true); }).observe(panel, { attributes: true, attributeFilter: ['hidden'] });
  bar.addEventListener('keydown', e => { if (!['ArrowRight','ArrowLeft','ArrowDown','ArrowUp','Home','End'].includes(e.key)) return;
    const visible = buttons.filter(b => !b.hidden && getComputedStyle(b).display !== 'none'); if (!visible.length) return;
    e.preventDefault(); const index = visible.indexOf(document.activeElement), delta = ['ArrowLeft','ArrowUp'].includes(e.key) ? -1 : 1;
    visible[e.key === 'Home' ? 0 : e.key === 'End' ? visible.length - 1 : (index + delta + visible.length) % visible.length].focus();
  });
  new MutationObserver(() => { if (bot.hidden || bot.classList.contains('welcome') || bot.classList.contains('tourmode')) { if (open) setOpen(false); } }).observe(bot, { attributes: true, attributeFilter: ['hidden','class'] });
})();
