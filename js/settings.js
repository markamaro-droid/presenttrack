/* Settings owns its layout and persistence; no privileged account operations. */
(() => {
  const { S, V, B, esc, ic, I, renderTop, toast } = podium.ext;
  const $ = id => document.getElementById(id);
  let saved = { picture: '', voice: true }, draftPicture = '', busy = false;
  const demoSettings = new Map();
  const themeKey = 'presenttrack.appearance';
  const validPicture = s => typeof s === 'string' && s.length < 100000 && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(s);
  const normalize = s => ({ picture: validPicture(s?.picture) ? s.picture : '', voice: s?.voice !== false });
  const snapshot = podium.snapshot, account = podium.account;
  podium.snapshot = () => ({ ...snapshot(), settings: { ...saved } });
  podium.account = (...args) => {
    account(...args);
    saved = normalize(window.PTCloud?.enabled ? PTCloud.row?.data?.settings : demoSettings.get(args[0]));
    S.u.pic = saved.picture; podium.setVoice?.(saved.voice); busy = false;
  };
  const deviceTheme = () => matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light';
  const theme = () => { try { const value = localStorage.getItem(themeKey); return ['light', 'dark'].includes(value) ? value : document.documentElement.dataset.theme || deviceTheme(); } catch { return document.documentElement.dataset.theme || deviceTheme(); } };
  function applyTheme(value) { document.documentElement.dataset.theme = value === 'light' ? 'light' : 'dark'; }
  // Resolve old System preferences once, then retain an explicit theme.
  const initialTheme = theme(); applyTheme(initialTheme);
  try { localStorage.setItem(themeKey, initialTheme); } catch {}
  // Keep the existing sign-in theme switch persistent too.
  $('theme').onclick = () => { const current = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light'); const next = current === 'dark' ? 'light' : 'dark'; applyTheme(next); try { localStorage.setItem(themeKey, next); } catch {} };
  const icon = name => `<span class="settings-icon">${ic(I[name] || I.set)}</span>`;
  const section = (id, glyph, title, description, content) => `<section class="settings-card" id="settings-${id}" data-sec="${id}"><header>${icon(glyph)}<div><h2>${title}</h2><p>${description}</p></div></header>${content}</section>`;
  const avatar = () => S.u.pic ? `<img id="sp" src="${esc(S.u.pic)}" alt="Your profile picture">` : `<span id="sp" class="settings-initial" aria-label="Your initials">${esc((S.u.name || 'P').split(' ').map(x => x[0]).join('').slice(0, 2))}</span>`;
  V.set = () => {
    const cloud = !!window.PTCloud?.enabled, confirmed = !!PTCloud?.user?.email_confirmed_at;
    return `<div class="workspace settings-page"><header class="settings-heading"><div><span class="dh-eyebrow">MAKE PRESENTTRACK YOURS</span><h1>Settings</h1><p>Your account, your workspace, your way of practicing.</p></div><span class="settings-badge">${icon('set')} Personal workspace</span></header>
      <nav class="settings-nav" aria-label="Settings sections">${[['profile','Profile'],['security','Account & security'],['appearance','Appearance'],['coaching','Coaching'],['privacy','Data & privacy']].map(([id, t]) => `<button type="button" data-settings-jump="${id}">${t}</button>`).join('')}</nav>
      <div class="settings-columns"><div class="settings-stack">
      ${section('profile', 'goal', 'Profile', 'How you appear in your workspace and reports.', `<form id="settings-profile-form"><div class="settings-identity"><div class="settings-avatar">${avatar()}</div><div><b>${esc(S.u.name)}</b><span>Student · Personal account</span><div class="acts"><button id="cp" class="bt gh sm" type="button">Change photo</button><button id="settings-remove" class="settings-text" type="button"${!S.u.pic ? ' disabled' : ''}>Remove</button></div></div></div><input id="settings-photo" type="file" accept="image/jpeg,image/png,image/webp" hidden><p class="settings-hint">JPG, PNG or WebP, up to 2 MB. Saved as a small profile image.</p><label for="sn">Full name</label><input id="sn" type="text" maxlength="80" minlength="2" required autocomplete="name" value="${esc(S.u.name)}"><div class="settings-save"><p id="profile-status" role="status">Save your name and photo together.</p><button id="ss" class="bt" type="submit">Save profile</button></div></form>`)}
      ${section('security', 'set', 'Account & Security', 'Manage access to your PresentTrack account.', `<div class="settings-row"><div><b>Email address</b><span class="settings-email">${esc(S.u.email)}</span></div><span class="settings-status">${cloud ? confirmed ? 'Verified' : 'Not confirmed' : 'Demo account'}</span></div><div class="settings-row"><div><b>Password</b><span>Receive a secure link to choose a new password.</span></div><button id="settings-reset" class="bt gh sm" type="button"${cloud ? '' : ' disabled'}>Reset password</button></div><p id="security-status" class="settings-hint" role="status">${cloud ? 'Reset instructions will be sent to your account email.' : 'Password reset is available for signed-in cloud accounts.'}</p><div class="settings-row"><div><b>Finished for now?</b><span>Sign out of this browser.</span></div><button id="settings-signout" class="settings-text" type="button">Sign out →</button></div>`)}
      </div><div class="settings-stack">
      ${section('appearance', 'decks', 'Appearance', 'Choose a look that feels comfortable.', `<div id="st" class="settings-themes" role="group" aria-label="Color theme">${['light','dark'].map(t => `<button type="button" data-settings-theme="${t}" aria-pressed="${theme() === t}"><span class="theme-preview ${t}" aria-hidden="true"><span class="theme-mini-sidebar"><i></i><i></i><i></i><i></i></span><span class="theme-mini-top"></span><span class="theme-mini-title"></span><span class="theme-mini-cards"><i></i><i></i><i></i></span><span class="theme-mini-panel"><svg viewBox="0 0 120 40" fill="none"><path d="M2 34L24 27L45 30L68 17L90 21L118 5" stroke="currentColor" stroke-width="3"/></svg></span></span><span>${t[0].toUpperCase() + t.slice(1)}</span></button>`).join('')}</div><p id="appearance-status" class="settings-hint" role="status">Preview your workspace, then choose Light or Dark. Your choice saves on this browser.</p>`)}
      ${section('coaching', 'prac', 'Coaching Preferences', 'Choose how Tracy guides your practice.', `<div class="settings-row"><div><label for="rv">Tracy speaks aloud</label><span>Voice guidance and spoken coaching replies.</span></div><label class="settings-switch"><input type="checkbox" id="rv"${podium.voiceOn !== false ? ' checked' : ''} aria-label="Tracy speaks aloud"><span></span></label></div><p id="coaching-status" class="settings-hint" role="status">Voice preference saves to your account.</p><div class="settings-row"><div><b>A quick refresher</b><span>Walk through the workspace with Tracy.</span></div><button class="bt gh sm" type="button" data-act="tour">Replay tour</button></div>`)}
      ${section('privacy', 'rep', 'Data & Privacy', 'Understand and access your practice data.', `<div class="settings-privacy-note">${icon('rep')}<p>Reports and transcripts stay in your private workspace. Raw practice audio is not retained.</p></div><details><summary>How speech processing works</summary><p>Practice audio is sent to Groq for transcription after you consent. Evaluation uses your browser’s speech service. Tracy conversations use the configured AI providers; voice mode explains processing before you start.</p></details><div class="settings-row"><div><b>Your practice record</b><span>Download reports or export filtered measurements.</span></div><button class="bt gh sm" type="button" data-go="hist">Open history</button></div><div class="settings-row"><div><b>Export workspace data</b><span>Includes saved transcripts, results, goals and settings. Keep the download private.</span></div><button id="settings-export" class="bt gh sm" type="button">Download JSON</button></div>`)}
      </div></div></div>`;
  };
  const owner = () => window.PTCloud?.enabled ? PTCloud.user?.id : S.u.email;
  async function persist(next) {
    const identity = owner();
    if (window.PTCloud?.enabled) {
      if (!identity) throw Error('Sign in again before saving.');
      const result = await PTCloud.saveNow({ ...podium.snapshot(), settings: next });
      if (result.error) throw Error('Could not save changes. Please try again.');
      if (owner() !== identity) throw Error('Your session changed. Please reopen Settings.');
    }
    saved = normalize(next); if (!window.PTCloud?.enabled) demoSettings.set(S.u.email, { ...saved }); podium.save();
  }
  B.set = () => {
    draftPicture = S.u.pic || '';
    document.querySelectorAll('[data-settings-jump]').forEach(b => b.onclick = () => { const target = $('settings-' + b.dataset.settingsJump); target.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion:reduce)').matches ? 'instant' : 'smooth', block: 'start' }); target.tabIndex = -1; target.focus({ preventScroll: true }); });
    document.querySelectorAll('[data-settings-theme]').forEach(b => b.onclick = () => { const value = b.dataset.settingsTheme; applyTheme(value); let stored = true; try { localStorage.setItem(themeKey, value); } catch { stored = false; } document.querySelectorAll('[data-settings-theme]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); $('appearance-status').textContent = stored ? 'Appearance saved on this browser.' : 'Appearance applied. Browser storage is unavailable, so it will reset after reload.'; });
    $('cp').onclick = () => $('settings-photo').click();
    const preview = () => { const area = document.querySelector('.settings-avatar'); area.innerHTML = draftPicture ? `<img id="sp" src="${draftPicture}" alt="Selected profile picture">` : `<span id="sp" class="settings-initial">${esc((S.u.name || 'P').slice(0, 1))}</span>`; $('settings-remove').disabled = !draftPicture; $('profile-status').textContent = 'Photo changed. Save profile to keep it.'; };
    $('settings-remove').onclick = () => { draftPicture = ''; preview(); };
    $('settings-photo').onchange = async e => {
      const file = e.target.files[0], identity = owner(); e.target.value = ''; if (!file) return;
      if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) { $('profile-status').textContent = 'Choose a JPG, PNG or WebP under 2 MB.'; return; }
      try { const bitmap = await createImageBitmap(file); const canvas = document.createElement('canvas'); canvas.width = canvas.height = 192; const c = canvas.getContext('2d'), size = Math.min(bitmap.width, bitmap.height); c.drawImage(bitmap, (bitmap.width-size)/2, (bitmap.height-size)/2, size, size, 0, 0, 192, 192); bitmap.close(); const picture = canvas.toDataURL('image/jpeg', .8); if (identity !== owner() || !$('settings-profile-form')) return; draftPicture = picture; preview(); } catch { if ($('profile-status')) $('profile-status').textContent = 'This image could not be read. Try another file.'; }
    };
    $('settings-profile-form').onsubmit = async e => {
      e.preventDefault(); if (busy) return; const name = $('sn').value.trim(), identity = owner(), photo = draftPicture, status = $('profile-status'), button = $('ss');
      if (name.length < 2 || name.length > 80) { status.textContent = 'Enter a name between 2 and 80 characters.'; return; }
      busy = true; button.disabled = true; status.textContent = 'Saving profile…';
      try {
        if (window.PTCloud?.enabled) { const { data, error } = await PTCloud.client.auth.updateUser({ data: { full_name: name } }); if (error) throw Error('Could not save your name. Please try again.'); if (owner() !== identity) return; if (data?.user) PTCloud.user = data.user; }
        S.u.name = name; podium.name = name.split(' ')[0]; renderTop();
        await persist({ ...saved, picture: photo }); if (owner() !== identity) return;
        S.u.pic = photo; renderTop(); status.textContent = 'Profile saved.'; document.querySelector('.settings-identity b')?.replaceChildren(document.createTextNode(name));
      } catch (error) { status.textContent = error.message; } finally { busy = false; button.disabled = false; }
    };
    $('rv').onchange = async e => { const input = e.target, previous = podium.voiceOn !== false, identity = owner(), status = $('coaching-status'); if (busy) { input.checked = previous; status.textContent = 'Finish saving your profile first.'; return; } busy = true; input.disabled = true; status.textContent = 'Saving voice preference…';
      try { await persist({ ...saved, voice: input.checked }); if (identity !== owner()) return; podium.setVoice?.(saved.voice); status.textContent = 'Voice preference saved.'; } catch (error) { input.checked = previous; status.textContent = error.message; } finally { busy = false; input.disabled = false; }
    };
    $('settings-reset').onclick = async e => { const b = e.currentTarget, status = $('security-status'); b.disabled = true; status.textContent = 'Sending reset instructions…'; try { const result = await PTCloud.reset(S.u.email); if (result.error) throw Error(); status.textContent = 'Reset email requested. Check your inbox and spam folder.'; } catch { status.textContent = 'Could not send the reset email. Please try again later.'; b.disabled = false; } };
    $('settings-signout').onclick = () => $('lo').click();
    $('settings-export').onclick = () => { const content = { exportedAt: new Date().toISOString(), profile: { name: S.u.name, email: S.u.email }, workspace: podium.snapshot() }; const url = URL.createObjectURL(new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = 'PresentTrack-workspace.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast('Workspace export downloaded.'); };
  };
})();
