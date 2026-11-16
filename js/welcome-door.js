/* One continuous entrance: the welcome model steps into the user's workspace. */
(() => {
  const $ = id => document.getElementById(id);
  let active = null, clearReveal = null;
  podium.welcomeEntering = () => !!active;
  podium.welcomeEnterCancel = () => { active?.cancel(); clearReveal?.(); };

  podium.welcomeEnter = onEntered => {
    if (active) return false;
    clearReveal?.();
    const bot = $('bot'), land = $('land');
    if (!bot || !land || land.hidden) { onEntered?.(); return true; }
    const source = bot.getBoundingClientRect();
    const motion = !matchMedia('(prefers-reduced-motion:reduce)').matches;
    podium.welcomeStop?.();
    podium.hushNow?.();
    const canvas = $('bc'), canvasTabIndex = canvas?.tabIndex;
    const previousOverflow = document.body.style.overflow, previousInert = land.inert;
    const overlay = document.createElement('div');
    overlay.id = 'welcome-door';
    overlay.dataset.phase = 'opening';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'welcome-door-title');
    overlay.innerHTML = `<div class="welcome-door-content">
      <p class="welcome-door-eyebrow">PRESENTTRACK</p>
      <h2 id="welcome-door-title">Let's step inside.</h2>
      <div class="welcome-door-scene" aria-hidden="true">
        <div class="welcome-door-floor"></div>
        <div class="welcome-door-frame">
          <div class="welcome-door-light"></div>
          <div class="welcome-door-interior"><i></i><span></span><span></span><span></span></div>
          <div class="welcome-door-leaf"><span class="welcome-door-mark"></span><span class="welcome-door-name">Your workspace</span><i class="welcome-door-handle"></i></div>
        </div>
        <div class="welcome-door-actor"></div>
      </div>
      <p class="welcome-door-caption" role="status">Tracy is opening your dashboard.</p>
      <button class="welcome-door-skip" type="button" data-door-skip>Skip animation <span aria-hidden="true">&rarr;</span></button>
    </div>`;
    document.body.appendChild(overlay);
    const scene = overlay.querySelector('.welcome-door-scene');
    const actor = overlay.querySelector('.welcome-door-actor');
    const doorway = overlay.querySelector('.welcome-door-frame');
    const skip = overlay.querySelector('[data-door-skip]');
    bot.classList.remove('app', 'menu');
    bot.classList.add('welcome', 'door-tracy');
    actor.appendChild(bot);
    if (canvas) { canvas.tabIndex = -1; canvas.setAttribute('aria-hidden', 'true'); }
    land.inert = true;
    document.body.style.overflow = 'hidden';
    skip.focus({ preventScroll: true });

    let settled = false, animation;
    const timers = [];
    const later = (fn, ms) => timers.push(setTimeout(fn, ms));
    const release = () => {
      timers.forEach(clearTimeout);
      animation?.cancel();
      document.removeEventListener('keydown', keydown, true);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('resize', resize);
      land.inert = previousInert;
      document.body.style.overflow = previousOverflow;
      podium.robotDoorPose?.('idle');
      bot.classList.remove('welcome', 'door-tracy');
      document.body.appendChild(bot);
      if (canvas) { canvas.tabIndex = canvasTabIndex; canvas.removeAttribute('aria-hidden'); }
    };
    const cancel = () => {
      if (settled) return;
      settled = true; active = null; release(); overlay.remove();
    };
    const finish = () => {
      if (settled) return;
      settled = true; active = null; release();
      overlay.dataset.phase = 'revealing';
      // The caller mounts the dashboard underneath this final fade.
      try { onEntered?.(); }
      finally {
        let revealTimer;
        const remove = () => { clearTimeout(revealTimer); overlay.remove(); if (clearReveal === remove) clearReveal = null; };
        clearReveal = remove;
        revealTimer = setTimeout(() => {
          const moveFocus = document.activeElement === skip;
          remove();
          if (moveFocus && !$('app')?.hidden && !podium.tourOn?.()) {
            const heading = document.querySelector('#view h1, #view h2');
            if (heading) { heading.setAttribute('tabindex', '-1'); heading.focus({ preventScroll: true }); }
          }
        }, motion ? 380 : 120);
      }
    };
    function keydown(event) {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); finish(); }
      else if (event.key === 'Tab') { event.preventDefault(); skip.focus({ preventScroll: true }); }
    }
    function visibility() { if (document.hidden) finish(); }
    function resize() { finish(); }
    active = { cancel };
    skip.onclick = finish;
    document.addEventListener('keydown', keydown, true);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('resize', resize, { passive: true });

    if (motion && actor.animate) {
      const at = actor.getBoundingClientRect(), door = doorway.getBoundingClientRect();
      const dx = source.left + source.width / 2 - (at.left + at.width / 2);
      const dy = source.top + source.height / 2 - (at.top + at.height / 2);
      const intoDoor = door.left + door.width / 2 - (at.left + at.width / 2);
      // Tracy's renderer sizes the model by canvas height, including on mobile.
      const scale = source.height > 0 && at.height > 0 ? source.height / at.height : 1;
      animation = actor.animate([
        { transform: `translate(${dx}px,${dy}px) scale(${scale})`, opacity: 1 },
        { transform: 'translate(0,0) scale(1)', opacity: 1, offset: .3 },
        { transform: 'translate(0,-4px) scale(1)', opacity: 1, offset: .42 },
        { transform: `translate(${intoDoor * .72}px,-9px) scale(.82)`, opacity: 1, offset: .72 },
        { transform: `translate(${intoDoor}px,-14px) scale(.4)`, opacity: .65, offset: .9 },
        { transform: `translate(${intoDoor}px,-18px) scale(.28)`, opacity: 0 }
      ], { duration: 2480, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' });
      podium.robotDoorPose?.('turn');
      later(() => { overlay.dataset.phase = 'entering'; podium.robotDoorPose?.('enter'); }, 1000);
      later(finish, 2580);
    } else {
      scene.classList.add('welcome-door-still');
      later(finish, 180);
    }
    return true;
  };
})();
