/* Post-login introduction: prepare Cartesia audio during the robot arrival. */
(() => {
  const $ = id => document.getElementById(id);
  const copy = "Hi! I am Tracy, your presentation coach. Welcome to PresentTrack! Let us start with a short speaking evaluation.";
  podium.welcomePrepare = () => podium.prepareNarration?.(copy);
  let cleanup = null;
  podium.welcomeStop = () => { cleanup?.(); cleanup = null; };
  podium.welcomeStart = () => {
    podium.welcomeStop();
    const stage = $('welcome-stage'), bot = $('bot'), button = $('leval'), caption = $('welcome-intro');
    if (!stage || !bot || !button) return;
    podium.welcomePrepare();
    caption.textContent = copy; button.hidden = false;
    const skip = $('welcome-skip'), replay = $('welcome-replay');
    const hero = stage.closest('.welcome-hero');
    hero.classList.remove('welcome-ready');
    let stopped = false, generation = 0, timer, arrival, waiting;
    const reducedMotion = matchMedia('(prefers-reduced-motion:reduce)').matches;
    stage.dataset.phase = 'waiting';
    const canvas = $('bc'); canvas.tabIndex = -1; canvas.setAttribute('aria-hidden', 'true');
    const finish = () => {
      if (stopped) return;
      clearTimeout(timer); cancelAnimationFrame(waiting); generation++;
      if (bot.parentElement !== stage) dock();
      podium.hushNow?.(); podium.robotPoint?.();
      caption.textContent = copy; button.hidden = false; skip.hidden = true; replay.hidden = false;
      stage.classList.add('introduced');
      hero.classList.add('welcome-ready');
      stage.dataset.phase = 'pointing';
    };
    const introduce = () => {
      if (stopped) return;
      const current = ++generation;
      stage.dataset.phase = 'preparing';
      caption.textContent = copy;
      let played = false;
      const speechStarted = () => {
        if (stopped || current !== generation) return;
        played = true; stage.dataset.phase = 'introducing'; caption.textContent = copy;
        // Playback, not network latency, determines the introduction's duration.
        clearTimeout(timer); timer = setTimeout(finish, 120000);
      };
      const speechDone = () => {
        if (stopped || current !== generation) return;
        // If playback is blocked or unavailable, keep the transcript and replay action usable.
        clearTimeout(timer);
        if (played) finish();
        else { caption.textContent = copy; finish(); replay.textContent = 'Play introduction'; }
      };
      // Always reveal the action even if device speech never emits an end event.
      clearTimeout(timer); timer = setTimeout(finish, 45000);
      if (podium.robotIntroduce) podium.robotIntroduce(copy, speechDone, speechStarted);
      else { clearTimeout(timer); timer = setTimeout(finish, 7000); }
    };
    function dock() {
      bot.classList.remove('app', 'menu'); bot.classList.add('welcome'); stage.appendChild(bot);
    }
    const greet = () => {
      if (stopped || stage.dataset.phase !== 'arriving') return;
      clearTimeout(timer);
      stage.dataset.phase = 'greeting';
      introduce();
    };
    const arrive = () => {
      dock();
      stage.dataset.phase = 'arriving';
      // Stay relaxed during the entrance; robotIntroduce owns the single
      // greeting wave and starts it only when the voice is actually playing.
      if (!reducedMotion && bot.animate) {
        arrival = bot.animate([
          { opacity: 0, transform: 'translateY(32px) scale(.92)' },
          { opacity: .75, transform: 'translateY(8px) scale(.98)', offset: .65 },
          { opacity: 1, transform: 'translateY(0) scale(1)' }
        ], { duration: 1800, easing: 'cubic-bezier(.22,.61,.36,1)', fill: 'none' });
        arrival.onfinish = greet;
        timer = setTimeout(greet, 1900);
      } else greet();
    };
    // Dock before waiting so Tracy never flashes in the lower-right corner.
    dock();
    const waitStarted = performance.now();
    const waitForScene = () => {
      if (stopped) return;
      // The login wipe obscures the page while showLand runs. Also wait for the first WebGL frame.
      if (!$('wipe')?.hidden || (podium.robotReady && !podium.robotReady() && performance.now() - waitStarted < 10000)) {
        waiting = requestAnimationFrame(waitForScene);
        return;
      }
      arrive();
    };
    waiting = requestAnimationFrame(waitForScene);
    skip.onclick = () => { arrival?.cancel(); finish(); };
    replay.textContent = 'Replay introduction';
    replay.onclick = () => {
      podium.welcomeStop();
      podium.robotShow?.(true, 'welcome');
      button.hidden = true; skip.hidden = false; replay.hidden = true;
      stage.classList.remove('introduced'); caption.textContent = 'Tracy is getting ready to say hello…';
      podium.welcomeStart();
    };
    const onVisibility = () => { if (document.hidden) { arrival?.cancel(); finish(); } };
    document.addEventListener('visibilitychange', onVisibility);
    cleanup = () => {
      stopped = true; generation++; clearTimeout(timer); cancelAnimationFrame(waiting); arrival?.cancel();
      document.removeEventListener('visibilitychange', onVisibility);
      podium.hushNow?.(); bot.classList.remove('welcome'); document.body.appendChild(bot);
      hero.classList.remove('welcome-ready');
      canvas.tabIndex = 0; canvas.removeAttribute('aria-hidden'); skip.onclick = replay.onclick = null;
    };
  };
})();
