/* Post-login introduction uses the existing robot and device voice; no AI calls or microphone. */
(() => {
  const $ = id => document.getElementById(id);
  const copy = "Hi, I’m Tracy, your presentation coach! I’ll guide you through PresentTrack, help you practice your delivery, and explain your feedback. Let’s start with a short speaking evaluation.";
  let cleanup = null;
  podium.welcomeStop = () => { cleanup?.(); cleanup = null; };
  podium.welcomeStart = () => {
    podium.welcomeStop();
    const stage = $('welcome-stage'), bot = $('bot'), button = $('leval'), caption = $('welcome-intro');
    if (!stage || !bot || !button) return;
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
      stage.dataset.phase = 'introducing';
      caption.textContent = copy;
      const started = performance.now();
      const speechDone = () => {
        if (stopped || current !== generation) return;
        // Autoplay can fail immediately. Leave time to read the introduction and see Tracy gesture.
        clearTimeout(timer);
        timer = setTimeout(finish, Math.max(0, 6500 - (performance.now() - started)));
      };
      // Always reveal the action even if device speech never emits an end event.
      clearTimeout(timer); timer = setTimeout(finish, 16000);
      if (podium.robotIntroduce) podium.robotIntroduce(copy, speechDone);
      else { clearTimeout(timer); timer = setTimeout(finish, 7000); }
    };
    function dock() {
      bot.classList.remove('app', 'menu'); bot.classList.add('welcome'); stage.appendChild(bot);
    }
    const greet = () => {
      if (stopped || stage.dataset.phase !== 'arriving') return;
      clearTimeout(timer);
      stage.dataset.phase = 'greeting';
      podium.robotWelcomeWave?.();
      timer = setTimeout(introduce, reducedMotion ? 0 : 1100);
    };
    const arrive = () => {
      const from = bot.getBoundingClientRect();
      dock();
      const to = bot.getBoundingClientRect();
      stage.dataset.phase = 'arriving';
      if (!reducedMotion && bot.animate && from.width && to.width) {
        const x = from.left + from.width / 2 - to.left - to.width / 2;
        const y = from.top + from.height / 2 - to.top - to.height / 2;
        podium.robotWelcomeWave?.();
        arrival = bot.animate([
          { transform: `translate(${x}px, ${y}px) scale(.48) rotate(-12deg)` },
          { transform: `translate(${x * .55}px, ${y * .35 - 35}px) scale(.72) rotate(8deg)`, offset: .45 },
          { transform: 'translate(0, -18px) scale(1.08) rotate(-4deg)', offset: .82 },
          { transform: 'translate(0, 0) scale(1) rotate(0deg)' }
        ], { duration: 2400, easing: 'ease-in-out', fill: 'none' });
        arrival.onfinish = greet;
        timer = setTimeout(greet, 2700);
      } else greet();
    };
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
