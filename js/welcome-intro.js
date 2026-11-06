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
    let stopped = false, generation = 0, timer, arrival;
    const from = bot.getBoundingClientRect();
    bot.classList.remove('app', 'menu'); bot.classList.add('welcome'); stage.appendChild(bot);
    const canvas = $('bc'); canvas.tabIndex = -1; canvas.setAttribute('aria-hidden', 'true');
    const finish = () => {
      if (stopped) return;
      clearTimeout(timer); generation++;
      podium.hushNow?.(); podium.robotPoint?.();
      caption.textContent = copy; button.hidden = false; skip.hidden = true; replay.hidden = false;
      stage.classList.add('introduced');
    };
    const introduce = () => {
      if (stopped) return;
      const current = ++generation;
      caption.textContent = copy;
      // Always reveal the action even if device speech never emits an end event.
      clearTimeout(timer); timer = setTimeout(finish, 16000);
      if (podium.robotIntroduce) podium.robotIntroduce(copy, () => { if (!stopped && current === generation) finish(); });
      else { clearTimeout(timer); timer = setTimeout(finish, 7000); }
    };
    const to = bot.getBoundingClientRect();
    if (!matchMedia('(prefers-reduced-motion:reduce)').matches && bot.animate && from.width && to.width) {
      arrival = bot.animate([
        { transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width})`, opacity: 0.6 },
        { transform: 'translate(0, -12px) scale(1.06)', opacity: 1, offset: 0.8 },
        { transform: 'translate(0, 0) scale(1)', opacity: 1 }
      ], { duration: 1400, easing: 'cubic-bezier(.2,.75,.25,1)', fill: 'none' });
      arrival.onfinish = introduce;
      timer = setTimeout(introduce, 1700);
    } else introduce();
    skip.onclick = () => { arrival?.cancel(); finish(); };
    replay.onclick = introduce;
    const onVisibility = () => { if (document.hidden) { arrival?.cancel(); finish(); } };
    document.addEventListener('visibilitychange', onVisibility);
    cleanup = () => {
      stopped = true; generation++; clearTimeout(timer); arrival?.cancel();
      document.removeEventListener('visibilitychange', onVisibility);
      podium.hushNow?.(); bot.classList.remove('welcome'); document.body.appendChild(bot);
      canvas.tabIndex = 0; canvas.removeAttribute('aria-hidden'); skip.onclick = replay.onclick = null;
    };
  };
})();
