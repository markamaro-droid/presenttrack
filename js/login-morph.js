/* Returning sign-in connects the login card to the live dashboard's main panel. */
(() => {
  const $ = id => document.getElementById(id);
  let active = null;
  podium.loginEntering = () => !!active;
  podium.loginMorphCancel = () => active?.cancel();

  podium.loginMorph = mount => {
    if (active) return false;
    const shell = document.querySelector('.shell'), card = document.querySelector('.auth .card'), app = $('app');
    const focusDashboard = () => {
      if (app?.hidden) return;
      const heading = document.querySelector('#view h1, #view h2');
      if (heading) { heading.setAttribute('tabindex', '-1'); heading.focus({ preventScroll: true }); }
    };
    const source = card?.getBoundingClientRect();
    if (!shell || !app || !source?.width || !source.height || shell.hidden || document.hidden
        || matchMedia('(prefers-reduced-motion:reduce)').matches || !card.animate) {
      mount(); focusDashboard(); return true;
    }
    const style = getComputedStyle(card);
    const from = { radius: style.borderRadius, background: style.backgroundColor, border: style.borderColor };
    const frame = rect => ({ left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
    const original = { overflow: document.body.style.overflow, shellInert: shell.inert, appInert: app.inert, opacity: app.style.opacity };
    const overlay = document.createElement('div');
    overlay.id = 'login-morph'; overlay.dataset.phase = 'leaving';
    overlay.setAttribute('aria-hidden', 'true');
    const surface = document.createElement('div'); surface.className = 'login-morph-surface';
    Object.assign(surface.style, frame(source), {
      borderRadius: from.radius, backgroundColor: from.background,
      boxShadow: `inset 0 0 0 1px ${from.border}`, opacity: '0'
    });
    overlay.appendChild(surface); document.body.appendChild(overlay);
    shell.inert = true; app.inert = true; app.style.opacity = '0';
    document.body.style.overflow = 'hidden';
    document.documentElement.classList.add('login-morph-active');
    const animations = [], timers = [];
    let mounted = false, settled = false;
    const later = (fn, ms) => timers.push(setTimeout(fn, ms));
    const animate = (element, frames, options) => {
      const animation = element.animate(frames, options); animations.push(animation); return animation;
    };
    const mountOnce = () => { if (!mounted) { mounted = true; mount(); } };
    const release = () => {
      settled = true; active = null;
      timers.forEach(clearTimeout); animations.forEach(animation => animation.cancel());
      document.removeEventListener('keydown', keydown, true);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('resize', finish);
      document.documentElement.classList.remove('login-morph-active');
      shell.inert = original.shellInert; app.inert = original.appInert; app.style.opacity = original.opacity;
      document.body.style.overflow = original.overflow; overlay.remove();
    };
    function finish() {
      if (settled) return;
      try { mountOnce(); } finally { release(); focusDashboard(); }
    }
    function keydown(event) {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); finish(); }
      else if (event.key === 'Tab') event.preventDefault();
    }
    function visibility() { if (document.hidden) finish(); }
    active = { cancel() { if (!settled) release(); } };
    document.addEventListener('keydown', keydown, true);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('resize', finish, { passive: true });

    const reveal = () => {
      if (settled) return;
      try {
        mountOnce();
        // Keep a scrolled mobile sign-in from shifting the destination down the page.
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        const target = document.querySelector('#view .dh-hero');
        if (!target) { finish(); return; }
        const destination = target.getBoundingClientRect(), toStyle = getComputedStyle(target);
        if (!destination.width || !destination.height) { finish(); return; }
        overlay.dataset.phase = 'morphing';
        // Copy only the destination panel. Login fields and credentials are never cloned.
        const content = document.createElement('div'); content.className = 'dashboard-home login-morph-content'; content.inert = true;
        content.style.background = toStyle.background;
        const preview = target.cloneNode(true);
        for (const node of [preview, ...preview.querySelectorAll('[id], [autofocus]')]) {
          node.removeAttribute('id'); node.removeAttribute('autofocus');
        }
        preview.classList.remove('rise');
        Object.assign(preview.style, { width: `${destination.width}px`, height: `${destination.height}px`, margin: '0' });
        content.appendChild(preview); surface.appendChild(content);
        const timing = { duration: 850, easing: 'cubic-bezier(.22,.8,.25,1)', fill: 'forwards' };
        const morph = animate(surface, [
          { ...frame(source), borderRadius: from.radius },
          { ...frame(destination), borderRadius: toStyle.borderRadius }
        ], timing);
        animate(content, [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'translateY(0)' }],
          { duration: 480, delay: 180, easing: 'ease-out', fill: 'both' });
        animate(app, [{ opacity: 0 }, { opacity: 1 }], { duration: 600, delay: 100, easing: 'ease-out', fill: 'forwards' });
        morph.onfinish = finish;
      } catch (error) { finish(); console.warn('Login transition unavailable', error); }
    };
    try {
      animate(shell, [{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: 'ease-in', fill: 'forwards' });
      animate(surface, [{ opacity: 0 }, { opacity: 1 }], { duration: 160, delay: 40, fill: 'forwards' });
      later(reveal, 200);
      later(finish, 1600); // A throttled/cancelled browser animation cannot block sign-in.
    } catch { finish(); }
    return true;
  };
})();
