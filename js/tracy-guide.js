/* On-request assistance uses the real Tracy and existing navigation handlers.
   The only automated clicks are allowlisted page links and a Practice link. */
(() => {
  const $ = id => document.getElementById(id), ext = () => window.podium?.ext;
  const bot = $('bot');
  let run = null, navigating = false;
  const dock = document.createElement('aside'), card = document.createElement('section'), highlight = document.createElement('div');
  dock.id = 'tracy-guide-dock'; dock.hidden = true; dock.setAttribute('aria-label', 'Tracy guide');
  dock.innerHTML = '<header class="tracy-guide-header"><div id="tracy-guide-avatar" aria-hidden="true"></div><div><b>Tracy</b><span>Your step-by-step guide</span></div><button type="button" data-guide="stop" aria-label="Stop guidance">×</button></header>';
  card.id = 'tracy-guide'; card.hidden = true; card.setAttribute('role', 'region'); card.setAttribute('aria-label', 'Tracy step guide');
  card.innerHTML = '<div aria-live="polite" aria-atomic="true"><small id="tracy-guide-count"></small><h2 id="tracy-guide-title"></h2><p id="tracy-guide-copy"></p></div><footer><button type="button" data-guide="back">Back</button><button type="button" data-guide="next">Next</button><button type="button" data-guide="chat">Back to chat</button></footer>';
  highlight.id = 'tracy-guide-highlight'; highlight.hidden = true; highlight.setAttribute('aria-hidden', 'true');
  dock.append(card); $('app').append(dock); document.body.append(highlight);
  const audioNote = document.createElement('small'); audioNote.hidden = true;
  audioNote.textContent = 'Speaking with your device voice.';
  card.append(audioNote);
  const button = action => dock.querySelector(`[data-guide="${action}"]`);
  const owner = () => window.PTCloud?.enabled ? PTCloud.user?.id : ext()?.S.u?.email;
  const available = () => ext() && !$('app').hidden && !ext().S.loading && !window.PTPracticeAudio?.capturing && !window.PTIdentity?.isAdmin(window.PTCloud?.user);
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const visible = el => !!el?.isConnected && el.getBoundingClientRect().width > 1 && el.getBoundingClientRect().height > 1;
  function stop(focus = false) {
    if (!run) return;
    const old = run; run = null;
    clearTimeout(old.timer); cancelAnimationFrame(old.frame);
    podium.hushNow?.();
    dock.hidden = card.hidden = highlight.hidden = true;
    audioNote.hidden = true;
    document.body.classList.remove('tracy-guiding');
    bot.classList.remove('assist-guide');
    for (const key of ['--guide-x', '--guide-y', '--guide-width', '--guide-height', 'visibility']) bot.style.removeProperty(key);
    old.target?.classList.remove('tracy-guide-click');
    if (focus && !bot.hidden) $('bc').focus({ preventScroll: true });
  }
  function safeNavigate(route, arg, control) {
    if (!run || !available()) return;
    navigating = true;
    try {
      // route is from TracyGuidePlan; never supplied by an AI reply or document.
      if (control?.dataset.go === route && !control.disabled) control.click();
      else ext().go(route, arg);
      run.expectedView = ext().S.view;
    } finally { navigating = false; }
  }
  function scrollTarget(target) {
    if (!target) return;
    target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
  }
  function display(step, count, auto = false) {
    if (!run) return;
    run.step = step; run.auto = auto; run.target = null;
    $('tracy-guide-count').textContent = count;
    $('tracy-guide-title').textContent = step.title;
    $('tracy-guide-copy').textContent = step.text;
    button('back').disabled = auto || run.index <= 0;
    button('next').disabled = auto;
    button('next').textContent = !auto && run.index === run.plan.steps.length - 1 ? 'Done' : 'Next';
    dock.hidden = card.hidden = false;
    podium.hushNow?.();
    layout();
  }
  function layout() {
    const current = run; if (!current || card.hidden) return;
    let target = current.explicitTarget || document.querySelector(current.step.target);
    if (!visible(target) && current.step.fallback) target = document.querySelector(current.step.fallback);
    if (current.step.frame && target) target = target.closest(current.step.frame);
    const main = $('mainc').getBoundingClientRect();
    const area = `${Math.round(main.width)}:${Math.round(main.height)}`;
    if (target !== current.target || current.area !== area) { current.target = target; current.area = area; if (visible(target)) scrollTarget(target); }
    const r = visible(target) ? target.getBoundingClientRect() : null;
    // Tracy stays inside a reserved avatar slot, never above workspace content.
    const slot = $('tracy-guide-avatar').getBoundingClientRect(), bounds = dock.getBoundingClientRect();
    bot.style.setProperty('--guide-x', `${slot.left}px`); bot.style.setProperty('--guide-y', `${slot.top}px`);
    bot.style.setProperty('--guide-width', `${slot.width}px`); bot.style.setProperty('--guide-height', `${slot.height}px`);
    bot.style.visibility = slot.top < bounds.top || slot.bottom > bounds.bottom ? 'hidden' : '';
    const viewport = target?.closest('#mainc,#nav')?.getBoundingClientRect() || { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
    const left = r ? Math.max(viewport.left + 2, r.left - 5) : 0, top = r ? Math.max(viewport.top + 2, r.top - 5) : 0;
    const right = r ? Math.min(viewport.right - 2, r.right + 5) : 0, bottom = r ? Math.min(viewport.bottom - 2, r.bottom + 5) : 0;
    highlight.hidden = !r || right <= left || bottom <= top;
    if (!highlight.hidden) Object.assign(highlight.style, { left: `${left}px`, top: `${top}px`, width: `${right - left}px`, height: `${bottom - top}px` });
  }
  function tick() {
    if (!run) return;
    if (!available() || owner() !== run.owner || bot.hidden || podium.tourOn?.() || ext().S.view !== run.expectedView) { stop(); return; }
    layout(); run.frame = requestAnimationFrame(tick);
  }
  function show(index, focus = false) {
    if (!run) return;
    if (index >= run.plan.steps.length) { stop(true); return; }
    clearTimeout(run.timer); run.explicitTarget = null; run.index = Math.max(0, index);
    display(run.plan.steps[run.index], `Step ${run.index + 1} of ${run.plan.steps.length}`);
    podium.robotPoint?.();
    // Existing cached narration respects Tracy's voice preference; no chat tokens.
    podium.narrate?.(run.step.text, Math.max(4000, run.step.text.split(/\s+/).length * 350));
    if (focus) button('next').focus({ preventScroll: true });
  }
  function afterNavigation() {
    if (!run) return;
    if (!run.plan.practice) { show(0, true); return; }
    const selected = ext().S.pres.find(p => String(p.id) === String(run.deck)) || ext().S.pres[0];
    const link = [...document.querySelectorAll('#view [data-go="prac"]')].find(el => String(el.dataset.a) === String(selected?.id));
    if (!selected || !link || link.disabled) {
      run.plan.steps = [{ target: '#view h1', fallback: '#view', title: 'Choose a ready presentation', text: 'Your presentation is not ready to open yet. Wait for its preview or upload to finish, then ask me to start practice again.' }];
      show(0, true); return;
    }
    run.explicitTarget = link;
    display({ title: 'Opening Practice', text: 'Follow me. I am opening the Practice button on your presentation.', target: '#view' }, 'Taking you there', true);
    const current = run;
    run.timer = setTimeout(() => {
      if (run !== current || !available()) return;
      link.classList.add('tracy-guide-click');
      safeNavigate('prac', selected.id, link); current.explicitTarget = null; show(0, true);
    }, reduced() ? 80 : 1350);
  }
  function start(plan, expectedOwner) {
    if (!available() || owner() !== expectedOwner) return;
    const deck = $('pd')?.value || (['pdet', 'prac', 'weak'].includes(ext().S.view) ? ext().S.arg : null);
    stop(); podium.tourStop?.(); window.PTVoice?.close(); podium.setMin?.(false);
    run = { plan, owner: expectedOwner, index: -1, deck, expectedView: ext().S.view };
    bot.classList.remove('menu'); bot.classList.add('assist-guide'); document.body.classList.add('tracy-guiding');
    if (plan.practice && ['prac', 'weak'].includes(ext().S.view) && $('pd')) { show(0, true); tick(); return; }
    const nav = document.querySelector(`#nav [data-go="${plan.route}"]`);
    run.explicitTarget = visible(nav) ? nav : null;
    display({ target: '#view h1', fallback: '#view', title: 'Follow me', text: 'I will open the right page, then show you what to do next.' }, 'Taking you there', true);
    const current = run;
    run.timer = setTimeout(() => {
      if (run !== current || !available()) return;
      safeNavigate(plan.route, undefined, nav); current.explicitTarget = null; afterNavigation();
    }, reduced() ? 80 : 850);
    button('stop').focus({ preventScroll: true }); tick();
  }
  function request(message) {
    if (!available()) return null;
    const kind = window.TracyGuidePlan?.intent(message); if (!kind) return null;
    const account = owner(); if (!account) return null;
    if (kind === 'tour') return { reply: 'I will show you around. You can pause or end the tour at any time.', execute: () => { if (available() && owner() === account) { stop(); PTVoice.close(); podium.startTour(); } } };
    const plan = TracyGuidePlan.plan(kind, { pending: ext().pendingEval(), hasDecks: ext().S.pres.length > 0 });
    if (!plan) return null;
    return { reply: 'Follow me. I will open the right page and guide you through it. Use Next at your own pace, or Stop guidance to take over.', execute: () => start(plan, account) };
  }
  dock.addEventListener('click', event => {
    const action = event.target.closest('[data-guide]')?.dataset.guide;
    if (!run || !action) return;
    if (action === 'stop') stop(true);
    else if (action === 'chat') { stop(); PTVoice.open(); }
    else if (!run.auto) show(run.index + (action === 'back' ? -1 : 1), true);
  });
  document.addEventListener('keydown', event => { if (run && event.key === 'Escape') { event.preventDefault(); stop(true); } });
  document.addEventListener('click', event => {
    if (!run || navigating) return;
    // Stop narration before a user's recording click reaches its real handler.
    if (event.target.closest('#vfs,#vfin,#prs,[data-go],[data-act="tour"],#bguide,#tour-guide,#tracy-clear,#lo,[data-mp="out"],.logo')) stop();
  }, true);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  window.addEventListener('pagehide', () => stop());
  window.addEventListener('tracy-audio-source', event => { if (run) audioNote.hidden = event.detail?.source !== 'device'; });
  window.PTCloud?.client?.auth.onAuthStateChange((_event, auth) => { if (run && auth?.user?.id !== run.owner) stop(); });
  window.PTTracyGuide = { request, stop, beforeNavigate: () => { if (!navigating) stop(); }, get active() { return !!run; } };
})();
