/* A fixed sequence and reusable voice clip: no chat generation is involved. */
(() => {
  const $ = id => document.getElementById(id);
  let active = null, clearReveal = null;
  podium.welcomeEntering = () => !!(active || clearReveal);
  podium.welcomeEnterCancel = () => { active?.cancel(); clearReveal?.(); };

  podium.welcomeEnter = onEntered => {
    if (active) return false;
    clearReveal?.();
    const bot = $('bot'), land = $('land');
    if (!bot || !land || land.hidden) { onEntered?.(); return true; }
    const source = bot.getBoundingClientRect();
    const button = $('leval'), origin = button?.getBoundingClientRect();
    const buttonColor = button ? getComputedStyle(button).backgroundColor : '';
    const copy = globalThis.PTWelcomeDoorSpeech?.text || "Let's dive into your speaking evaluation. Follow me inside, and we'll take it one step at a time.";
    const motion = !matchMedia('(prefers-reduced-motion:reduce)').matches;
    podium.welcomeStop?.();
    podium.hushNow?.();
    const canvas = $('bc'), canvasTabIndex = canvas?.tabIndex;
    const previousOverflow = document.body.style.overflow, previousInert = land.inert;
    const overlay = document.createElement('div');
    overlay.id = 'welcome-door';
    overlay.dataset.phase = 'forming';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'welcome-door-title');
    overlay.innerHTML = `<div class="welcome-door-content">
      <p class="welcome-door-eyebrow">PRESENTTRACK</p>
      <h2 id="welcome-door-title">Let's dive in.</h2>
      <div class="welcome-door-scene" aria-hidden="true">
        <div class="welcome-door-floor"></div>
        <div class="welcome-door-frame">
          <div class="welcome-door-interior"><div class="welcome-door-grid"></div><div class="welcome-door-horizon"></div><div class="welcome-door-rings"><i></i><i></i><i></i></div></div>
          <div class="welcome-door-panels"><div class="welcome-door-panel"><i class="welcome-door-panel-line"></i></div><div class="welcome-door-panel"><i class="welcome-door-panel-line"></i></div><span class="welcome-door-badge">STEP INSIDE</span></div>
          <span class="welcome-door-rim"></span>
          <span class="welcome-door-origin">Start evaluation</span>
        </div>
        <div class="welcome-door-actor"></div>
      </div>
      <p class="welcome-door-caption" role="status"></p>
      <button class="welcome-door-skip" type="button" data-door-skip>Skip animation <span aria-hidden="true">&rarr;</span></button>
    </div>`;
    document.body.appendChild(overlay);
    const actor = overlay.querySelector('.welcome-door-actor');
    const doorway = overlay.querySelector('.welcome-door-frame');
    const skip = overlay.querySelector('[data-door-skip]');
    overlay.querySelector('.welcome-door-caption').textContent = copy;
    bot.classList.remove('app', 'menu');
    bot.classList.add('welcome', 'door-tracy');
    actor.appendChild(bot);
    if (canvas) { canvas.tabIndex = -1; canvas.setAttribute('aria-hidden', 'true'); }
    land.inert = true;
    document.body.style.overflow = 'hidden';
    skip.focus({ preventScroll: true });

    let settled = false, narration, approach, speechStarted = false, speechClosed = false, entering = false, audioTimer;
    let mounted = false, restoreDashboard = null;
    const mountDashboard = () => { if (!mounted) { mounted = true; onEntered?.(); } };
    const timers = [], animations = [];
    const later = (fn, ms) => timers.push(setTimeout(fn, ms));
    const animate = (el, frames, options) => {
      if (!motion || !el.animate) return null;
      const animation = el.animate(frames, options); animations.push(animation); return animation;
    };
    const clearAnimations = () => animations.forEach(animation => animation.cancel());
    const release = (keepVisuals = false) => {
      timers.forEach(clearTimeout);
      clearTimeout(audioTimer);speechClosed = true; narration?.cancel?.();podium.hushNow?.();
      if (!keepVisuals) clearAnimations();
      restoreDashboard?.();restoreDashboard = null;
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
      clearTimeout(window.__auto);
      settled = true; active = null; release(); overlay.remove();
    };
    const finish = (morphed = false) => {
      if (settled) return;
      const throughPortal = morphed === true && motion;
      settled = true; active = null; release(throughPortal);
      overlay.dataset.morphed = String(throughPortal);
      overlay.dataset.phase = 'revealing';
      // The dashboard shown through the portal is the same live page we leave open.
      try {
        mountDashboard();
      }
      finally {
        let revealTimer;
        const remove = () => { clearTimeout(revealTimer); clearAnimations(); overlay.remove(); if (clearReveal === remove) clearReveal = null; };
        clearReveal = remove;
        revealTimer = setTimeout(() => {
          const moveFocus = document.activeElement === skip;
          remove();
          if (moveFocus && !$('app')?.hidden && !podium.tourOn?.()) {
            const heading = document.querySelector('#view h1, #view h2');
            if (heading) { heading.setAttribute('tabindex', '-1'); heading.focus({ preventScroll: true }); }
          }
        }, throughPortal ? 560 : motion ? 380 : 120);
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

    const at = actor.getBoundingClientRect(), door = doorway.getBoundingClientRect();
    const intoDoor = door.left + door.width / 2 - (at.left + at.width / 2);
    const intoY = door.top + door.height / 2 - (at.top + at.height / 2);
    const formingTime = motion ? 850 : 120;
    if (motion) {
      const dx = source.left + source.width / 2 - (at.left + at.width / 2);
      const dy = source.top + source.height / 2 - (at.top + at.height / 2);
      // Tracy's renderer sizes the model by canvas height, including on mobile.
      const scale = source.height > 0 && at.height > 0 ? source.height / at.height : 1;
      animate(actor, [
        { transform: `translate(${dx}px,${dy}px) scale(${scale})`, opacity: 1 },
        { transform: 'translate(0,0) scale(1)', opacity: 1 }
      ], { duration: formingTime, easing: 'cubic-bezier(.22,.7,.25,1)', fill: 'none' });
      if (origin?.width > 0 && origin.height > 0) {
        const sx = origin.width / door.width, sy = origin.height / door.height;
        animate(doorway, [
          { transform: `translate(${origin.left + origin.width / 2 - (door.left + door.width / 2)}px,${origin.top + origin.height / 2 - (door.top + door.height / 2)}px) scale(${sx},${sy})`, backgroundColor: buttonColor, borderColor: buttonColor, borderRadius: '16px' },
          { transform: 'translate(0,0) scale(1,1)', backgroundColor: '#081526', borderColor: '#20344f', borderRadius: '28px 28px 17px 17px' }
        ], { duration: formingTime, easing: 'cubic-bezier(.22,.7,.25,1)', fill: 'none' });
        animate(overlay.querySelector('.welcome-door-origin'), [
          { transform: `translate(-50%,-50%) scale(${1 / sx},${1 / sy})`, opacity: 1 },
          { transform: 'translate(-50%,-50%) scale(1)', opacity: 0 }
        ], { duration: 220, fill: 'forwards' });
      }
      for (const detail of doorway.querySelectorAll('.welcome-door-rim,.welcome-door-panels,.welcome-door-interior')) {
        animate(detail, [{ opacity: 0 }, { opacity: 1 }], { delay: 160, duration: 580, fill: 'backwards' });
      }
    }

    const crossPortal = () => {
      if (settled) return;
      const app = $('app');
      if (!motion || !doorway.animate || !app) { finish(); return; }
      overlay.dataset.phase = 'crossing';
      const rect = overlay.querySelector('.welcome-door-interior').getBoundingClientRect();
      const width = document.documentElement.clientWidth, height = window.innerHeight;
      const top = Math.max(0,rect.top), left = Math.max(0,rect.left);
      const right = Math.max(0,width - rect.left - rect.width), bottom = Math.max(0,height - rect.top - rect.height);
      const opening = `inset(${top}px ${right}px ${bottom}px ${left}px round 18px)`;
      const viewport = document.createElement('div');viewport.className = 'welcome-dashboard-window';
      viewport.setAttribute('aria-hidden','true');viewport.style.clipPath = opening;
      const edge = document.createElement('div');edge.className = 'welcome-dashboard-edge';
      edge.setAttribute('aria-hidden','true');
      const flare = document.createElement('div');flare.className = 'welcome-dashboard-flare';
      const placeholder = document.createComment('Dashboard position');app.before(placeholder);
      const wasInert = app.inert, botVisibility = bot.style.visibility;
      restoreDashboard = () => {
        placeholder.replaceWith(app);app.inert = wasInert;bot.style.visibility = botVisibility;
        viewport.remove();
      };
      app.inert = true;viewport.appendChild(app);viewport.appendChild(flare);
      overlay.appendChild(viewport);overlay.appendChild(edge);
      try { mountDashboard(); } catch (error) { finish();console.error(error);return; }
      bot.style.visibility = 'hidden';
      overlay.dataset.connected = 'true';
      // Hold the real page in the doorway briefly, then expand that same aperture.
      // The page keeps its viewport layout, so cards do not jump or reflow mid-morph.
      const timing = {duration:1500,easing:'cubic-bezier(.65,0,.22,1)',fill:'forwards'};
      animate(viewport,[
        {clipPath:opening,offset:0},{clipPath:opening,offset:.16},
        {clipPath:'inset(0px 0px 0px 0px round 0px)',offset:1}
      ],timing);
      const frame = {left:`${left}px`,top:`${top}px`,width:`${width-left-right}px`,height:`${height-top-bottom}px`,borderRadius:'18px'};
      animate(edge,[frame,{...frame,offset:.16},
        {left:'0px',top:'0px',width:`${width}px`,height:`${height}px`,borderRadius:'0px'}
      ],timing);
      animate(edge,[{opacity:1,offset:0},{opacity:1,offset:.65},{opacity:0,offset:1}],{duration:1500,fill:'forwards'});
      animate(app,[{transform:'scale(1.06)',opacity:.35},{transform:'scale(1.035)',opacity:1,offset:.22},{transform:'scale(1)',opacity:1}],timing);
      animate(flare,[{transform:'translateX(-100%)',opacity:0},{opacity:.65,offset:.35},{transform:'translateX(100%)',opacity:0}],{duration:1350,delay:150,easing:'ease-in-out',fill:'both'});
      later(() => finish(true), 1500);
    };
    const enter = () => {
      if (settled || entering) return;
      entering = true; speechClosed = true; clearTimeout(audioTimer); narration?.cancel?.();
      const from = getComputedStyle(actor).transform;
      approach?.cancel(); overlay.dataset.phase = 'entering'; podium.robotDoorPose?.('enter');
      animate(actor, [
        { transform: from === 'none' ? 'translate(0,0) scale(1)' : from, opacity: 1 },
        { transform: `translate(${intoDoor * .82}px,${intoY}px) scale(.72)`, opacity: 1, offset: .68 },
        { transform: `translate(${intoDoor}px,${intoY}px) scale(.25)`, opacity: 0 }
      ], { duration: 1600, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' });
      later(crossPortal, motion ? 1650 : 150);
    };
    const captionOnly = () => {
      if (settled || speechClosed) return;
      speechClosed = true; clearTimeout(audioTimer); narration?.cancel?.();podium.hushNow?.();
      overlay.dataset.phase = 'speaking';
      later(enter, 2400);
    };
    const beginSpeech = () => {
      if (settled) return;
      overlay.dataset.phase = 'speaking';
      if (podium.voiceOn === false || !podium.robotDoorNarrate) { captionOnly(); return; }
      // Loading or blocked audio cannot trap the user; the same caption remains.
      audioTimer = setTimeout(captionOnly, 4000);
      try {
        narration = podium.robotDoorNarrate(copy, {
          onstart() {
            if (settled || speechClosed || speechStarted) return;
            speechStarted = true; clearTimeout(audioTimer);
            audioTimer = setTimeout(captionOnly, 16000);
            // Approach gently while speaking; cross the threshold after the line ends.
            approach = animate(actor, [
              { transform: 'translate(0,0) scale(1)' },
              { transform: `translate(${intoDoor * .18}px,0) scale(.96)` }
            ], { duration: 3000, easing: 'ease-in-out', fill: 'forwards' });
            later(() => { if (!settled && !speechClosed) podium.robotDoorPose?.('turn'); }, 700);
          },
          onend() { if (!settled && !speechClosed) enter(); },
          onerror: captionOnly
        });
      } catch { captionOnly(); }
    };
    later(beginSpeech, formingTime);
    return true;
  };
})();
