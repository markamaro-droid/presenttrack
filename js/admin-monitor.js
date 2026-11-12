/* Read-only administrator monitoring. Private reports and transcripts stay private. */
(() => {
  const { S, V, B, page, esc, go } = podium.ext;
  const $ = id => document.getElementById(id);
  const count = value => Number.isFinite(Number(value)) ? Number(value).toLocaleString() : 'Unavailable';
  const date = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString() : 'Never';
  const owner = () => window.PTCloud?.user?.id;
  const allowed = () => PTIdentity.isAdmin(PTCloud?.user) && !PTIdentity.mustChange(PTCloud.user);
  let directoryOwner, query = '', filter = 'all', currentPage = 1, directoryRequest = 0;
  async function request(filters = {}) {
    if (!allowed()) throw Error('Change your initial admin password before opening monitoring.');
    const identity = owner(), { data } = await PTCloud.client.auth.getSession();
    if (!data.session || owner() !== identity) throw Error('Please sign in again.');
    const response = await fetch('/api/admin', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + data.session.access_token },
      body: JSON.stringify({ action: 'overview', ...filters }), signal: AbortSignal.timeout(25000) });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result) throw Error(result?.message || 'Monitoring is unavailable. Check your connection and retry.');
    if (identity !== owner() || !allowed()) throw Error('Your account changed. Sign in again.');
    return result;
  }
  const metric = (label, value, hint = '') => `<article class="admin-metric"><span>${label}</span><strong>${count(value)}</strong>${hint ? `<small>${hint}</small>` : ''}</article>`;
  const errorHTML = error => `<p role="alert">${esc(error.message || 'Monitoring could not load.')}</p><p>Existing account data has not been changed.</p>`;
  window.PTAdminMonitor = {
    overviewHTML: () => `<section class="pn admin-overview"><div class="admin-toolbar"><h2>System overview</h2><button class="bt gh sm" id="admin-refresh" type="button">Refresh overview</button></div><p id="admin-overview-status" role="status">Loading current system data...</p><div id="admin-overview-content"></div></section>`,
    mountOverview() {
      const root = $('admin-overview-content'), note = $('admin-overview-status'), button = $('admin-refresh');
      if (!root || !allowed()) return;
      const identity = owner();
      async function load() {
        button.disabled = true; note.textContent = 'Loading current system data...'; root.innerHTML = '';
        try {
          const data = await request(); if (!root.isConnected || identity !== owner()) return;
          const s = data.summary, l = data.library, usage = data.usage24h, registrations = data.registrations || [], max = Math.max(1,...registrations.map(d => Number(d.users) || 0));
          root.innerHTML = `<div class="admin-metrics">${metric('Registered users',s.users,`${count(s.students)} students · ${count(s.admins)} admins`)}${metric('New users',s.newUsers7d,'Last 7 days')}${metric('Users who signed in',s.signedIn7d,'Last 7 days; not a live online count')}${metric('Completed evaluations',s.evaluatedStudents,`${count(s.pendingStudents)} students still pending`)}${metric('Saved presentations',s.presentations,'Across all user workspaces')}${metric('Practice reports',s.practiceReports,'Saved recorded-audio reports')}</div>
            <div class="admin-sections"><section><h3>Presentation library</h3><dl class="admin-facts"><div><dt>Total decks</dt><dd>${count(l.total)}</dd></div><div><dt>Published</dt><dd>${count(l.published)}</dd></div><div><dt>Drafts / hidden</dt><dd>${count(l.drafts)}</dd></div><div><dt>Admin uploads</dt><dd>${count(l.uploaded)}</dd></div></dl></section>
            <section><h3>AI usage in the last 24 hours</h3><dl class="admin-facts"><div><dt>Recording analysis attempts</dt><dd>${count(usage.recordingAttempts)}</dd></div><div><dt>Chat requests</dt><dd>${count(usage.chatRequests)}</dd></div><div><dt>Voice requests</dt><dd>${count(usage.voiceRequests)}</dd></div></dl><p class="basis">Accepted quota requests, including attempts that later failed. These are not successful-report counts.</p></section></div>
            <section class="admin-trend"><h3>Daily registrations</h3><p class="basis">Seven calendar days in UTC. Counts include student and administrator accounts.</p><ul>${registrations.map(day => `<li><span>${esc(day.date)}</span><span class="admin-bar" aria-hidden="true"><i style="width:${Math.max(0, Math.min(100, Number(day.users) / max * 100))}%"></i></span><strong>${count(day.users)}</strong></li>`).join('')}</ul></section>
            <section><h3>System configuration</h3><ul class="admin-config">${[['database','Database monitoring'],['transcription','Groq transcription key'],['fillerCheck','Gemini filler-check key'],['speech','Cartesia speech key']].map(([key,label])=>`<li><span>${label}</span><b>${data.configuration?.[key] ? key === 'database' ? 'Available' : 'Configured' : 'Not configured'}</b></li>`).join('')}</ul><p class="basis">Key presence does not verify provider uptime, credits or model access. No paid AI requests are made by this check.</p></section>`;
          note.textContent = 'Last refreshed: ' + date(data.generatedAt) + '. Refresh to load recent changes.';
        } catch (error) { if (root.isConnected && identity === owner()) { root.innerHTML = errorHTML(error); note.textContent = 'Overview unavailable.'; } }
        finally { if (button.isConnected) button.disabled = false; }
      }
      button.onclick = load; load();
    }
  };
  V.adminUsers = () => {
    if (!allowed()) return page('Users', '', '<p>Change your initial admin password in the Admin Dashboard to view accounts.</p>');
    if (directoryOwner !== owner()) { directoryOwner = owner(); query = ''; filter = 'all'; currentPage = 1; }
    return page('Users', 'Monitor account registration, sign-ins and practice participation.', `<section class="pn admin-users"><form id="admin-user-search" class="admin-toolbar"><label for="admin-user-query">Search name or email<input id="admin-user-query" type="search" maxlength="120" value="${esc(query)}" placeholder="Find a user"></label><label for="admin-user-filter">Account filter<select id="admin-user-filter">${[['all','All accounts'],['student','Students'],['admin','Administrators'],['completed','Evaluation completed'],['pending','Evaluation pending']].map(([value,label])=>`<option value="${value}"${filter===value?' selected':''}>${label}</option>`).join('')}</select></label><button class="bt" type="submit">Search</button></form><p id="admin-users-status" role="status">Loading users...</p><div id="admin-users-results"></div><div class="admin-pagination"><button id="admin-users-prev" class="bt gh sm" type="button" disabled>Previous</button><span id="admin-users-page"></span><button id="admin-users-next" class="bt gh sm" type="button" disabled>Next</button></div><p class="basis">Account summaries only. Student transcripts, passwords and private presentation content are not displayed.</p></section>`);
  };
  B.adminUsers = () => {
    if (!allowed() || !$('admin-user-search')) return;
    const root = $('admin-users-results'), note = $('admin-users-status'), identity = owner(), form = $('admin-user-search'), previous = $('admin-users-prev'), next = $('admin-users-next');
    async function load() {
      const generation = ++directoryRequest;
      previous.disabled = next.disabled = form.querySelector('button').disabled = true; root.innerHTML = ''; note.textContent = 'Loading users...';
      try {
        const data = await request({ page: currentPage, query, filter });
        if (!root.isConnected || generation !== directoryRequest || identity !== owner()) return;
        const total = data.pagination.total, pages = Math.max(1,Math.ceil(total / data.pagination.pageSize));
        if (currentPage > pages) { currentPage = pages; return load(); }
        note.textContent = `${count(total)} matching account${total===1?'':'s'}.`;
        $('admin-users-page').textContent = `Page ${currentPage} of ${pages}`;
        root.innerHTML = !data.users.length ? '<p>No users match this search.</p>' : `<div class="admin-table-scroll" tabindex="0" role="region" aria-label="User accounts"><table class="admin-table"><thead><tr>${['User','Role','Account status','Evaluation','Presentations','Practice reports','Joined','Last sign-in'].map(h=>`<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${data.users.map(user=>`<tr><td><strong>${esc(user.name || 'Unnamed user')}</strong><span>${esc(user.email || 'No email')}</span></td><td>${esc(user.role)}</td><td>${esc(user.status)}</td><td>${user.role==='admin'?'Not required':user.evaluated?'Completed':'Pending'}</td><td>${count(user.presentations)}</td><td>${count(user.reports)}</td><td>${esc(date(user.created_at))}</td><td>${esc(date(user.last_sign_in_at))}</td></tr>`).join('')}</tbody></table></div>`;
        previous.disabled = currentPage <= 1; next.disabled = currentPage >= pages;
      } catch (error) { if (root.isConnected && generation === directoryRequest && identity === owner()) { root.innerHTML = errorHTML(error); note.textContent = 'Users unavailable. Choose Search to retry.'; } }
      finally { if (form.isConnected && generation === directoryRequest) form.querySelector('button').disabled = false; }
    }
    form.onsubmit = event => { event.preventDefault(); query = $('admin-user-query').value.trim(); filter = $('admin-user-filter').value; currentPage = 1; load(); };
    previous.onclick = () => { currentPage--; load(); }; next.onclick = () => { currentPage++; load(); }; load();
  };
})();
