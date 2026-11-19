/* Returning users enter the real dashboard immediately, with a quiet staggered reveal. */
(() => {
  let active = null;
  podium.dashboardEntering = () => !!active;
  podium.dashboardEntranceCancel = () => active?.();
  podium.dashboardEnter = mount => {
    if (active) return false;
    mount();
    const app = document.getElementById('app');
    if (!app || app.hidden) return true;
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    const heading = document.querySelector('#view h1, #view h2');
    if (heading) { heading.setAttribute('tabindex', '-1'); heading.focus({ preventScroll: true }); }
    if (document.hidden || matchMedia('(prefers-reduced-motion:reduce)').matches || !app.animate) return true;

    const animations = [];
    let timer, settled = false;
    const finish = () => {
      if (settled) return;
      settled = true; active = null; clearTimeout(timer);
      animations.forEach(animation => animation.cancel());
      delete app.dataset.entering;
      document.removeEventListener('visibilitychange', visibility);
      document.removeEventListener('pointerdown', finish, true);
      document.removeEventListener('keydown', finish, true);
      document.removeEventListener('wheel', finish, true);
      window.removeEventListener('resize', finish);
    };
    const visibility = () => { if (document.hidden) finish(); };
    const animate = (element, frames, options) => {
      const animation = element.animate(frames, options); animations.push(animation); return animation;
    };
    active = finish; app.dataset.entering = 'true';
    document.addEventListener('visibilitychange', visibility);
    // Interacting finishes the reveal immediately; controls stay usable throughout.
    document.addEventListener('pointerdown', finish, true);
    document.addEventListener('keydown', finish, true);
    document.addEventListener('wheel', finish, { capture: true, passive: true });
    window.addEventListener('resize', finish, { passive: true });
    try {
      let last = animate(app, [{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: 'ease-out', fill: 'both' });
      const panels = app.querySelectorAll('#view .dh-welcome, #view .dh-hero, #view .dh-stat, #view .dh-grid, #view .dh-footer');
      panels.forEach((panel, index) => {
        last = animate(panel, [
          { opacity: 0, transform: 'translateY(14px)' },
          { opacity: 1, transform: 'translateY(0)' }
        ], { duration: 520, delay: Math.min(index * 45, 240), easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'both' });
      });
      last.onfinish = finish;
      timer = setTimeout(finish, 1000); // Restore normal styles even if the browser drops completion events.
    } catch { finish(); }
    return true;
  };
})();
