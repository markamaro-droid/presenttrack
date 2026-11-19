/* After a successful returning login, the blue button becomes the dashboard panel. */
(() => {
  const $ = id => document.getElementById(id);
  let active = null;
  podium.dashboardEntering = () => !!active;
  podium.dashboardEntranceCancel = () => active?.();
  podium.dashboardEnter = mount => {
    if (active) return false;
    const shell = document.querySelector('.shell'), button = document.querySelector('#loginForm .btn'), app = $('app');
    const focusDashboard = () => {
      if (app?.hidden) return;
      const heading = document.querySelector('#view h1, #view h2');
      if (heading) { heading.setAttribute('tabindex', '-1'); heading.focus({ preventScroll: true }); }
    };
    const source = button?.getBoundingClientRect();
    if (!shell || shell.hidden || !app || !source?.width || !source.height || document.hidden
        || matchMedia('(prefers-reduced-motion:reduce)').matches || !button.animate) {
      mount(); focusDashboard(); return true;
    }
    const style = getComputedStyle(button);
    const from = { radius: style.borderRadius, background: style.backgroundColor, color: style.color, font: style.font };
    const bounds = rect => ({ left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
    const original = { overflow: document.body.style.overflow, shellInert: shell.inert,
      appInert: app.inert, opacity: app.style.opacity, buttonVisibility: button.style.visibility };
    const overlay = document.createElement('div'); overlay.id = 'dashboard-morph'; overlay.dataset.phase = 'button';
    overlay.setAttribute('aria-hidden', 'true');
    const surface = document.createElement('div'); surface.className = 'dashboard-morph-surface';
    Object.assign(surface.style, bounds(source), { backgroundColor: from.background, borderRadius: from.radius });
    const label = document.createElement('span'); label.className = 'dashboard-morph-label';
    label.textContent = button.textContent.trim(); label.style.color = from.color; label.style.font = from.font;
    surface.appendChild(label); overlay.appendChild(surface); document.body.appendChild(overlay);
    button.style.visibility = 'hidden'; shell.inert = true; app.inert = true; app.style.opacity = '0';
    document.body.style.overflow = 'hidden'; document.documentElement.classList.add('dashboard-morph-active');
    let mounted = false, settled = false;
    const animations = [], timers = [];
    const later = (fn, ms) => timers.push(setTimeout(fn, ms));
    const animate = (element, frames, options) => {
      const animation = element.animate(frames, options); animations.push(animation); return animation;
    };
    const mountOnce = () => { if (!mounted) { mounted = true; mount(); } };
    const release = () => {
      settled = true; active = null; timers.forEach(clearTimeout);
      animations.forEach(animation => animation.cancel());
      document.removeEventListener('keydown', keydown, true);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('resize', finish);
      document.documentElement.classList.remove('dashboard-morph-active');
      document.body.style.overflow = original.overflow;
      shell.inert = original.shellInert; app.inert = original.appInert; app.style.opacity = original.opacity;
      button.style.visibility = original.buttonVisibility; overlay.remove();
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
    active = () => { if (!settled) release(); };
    document.addEventListener('keydown', keydown, true);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('resize', finish, { passive: true });
    const expand = () => {
      if (settled) return;
      try {
        mountOnce(); window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        const target = document.querySelector('#view .dh-hero');
        if (!target) { finish(); return; }
        const destination = target.getBoundingClientRect(), toStyle = getComputedStyle(target);
        if (!destination.width || !destination.height) { finish(); return; }
        overlay.dataset.phase = 'expanding';
        // Only the destination is copied; login fields and credentials never enter the animation.
        const content = document.createElement('div'); content.className = 'dashboard-home dashboard-morph-content'; content.inert = true;
        content.style.background = toStyle.background;
        const preview = target.cloneNode(true);
        for (const node of [preview, ...preview.querySelectorAll('[id], [autofocus]')]) {
          node.removeAttribute('id'); node.removeAttribute('autofocus');
        }
        preview.classList.remove('rise');
        Object.assign(preview.style, { width: `${destination.width}px`, height: `${destination.height}px`, margin: '0' });
        content.appendChild(preview); surface.appendChild(content);
        const morph = animate(surface, [
          { ...bounds(source), borderRadius: from.radius },
          { ...bounds(destination), borderRadius: toStyle.borderRadius }
        ], { duration: 1200, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' });
        animate(content, [{ opacity: 0 }, { opacity: 1 }], { duration: 500, delay: 550, easing: 'ease-out', fill: 'both' });
        animate(app, [{ opacity: 0 }, { opacity: 1 }], { duration: 650, delay: 300, easing: 'ease-out', fill: 'forwards' });
        morph.onfinish = finish;
      } catch { finish(); }
    };
    try {
      animate(label, [{ opacity: 1 }, { opacity: 0 }], { duration: 160, delay: 100, fill: 'forwards' });
      animate(shell, [{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: 'ease-in', fill: 'forwards' });
      later(expand, 200);
      later(finish, 2100); // A stalled browser animation can never trap the user.
    } catch { finish(); }
    return true;
  };
})();
