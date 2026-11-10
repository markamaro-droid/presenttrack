/* Shared catalog; copies used for practice belong to the student's workspace. */
(() => {
  const { S, V, B, go, esc, page, sec, toast, FILES, pendingEval } = podium.ext;
  const $ = id => document.getElementById(id);
  const isAdmin = () => PTIdentity.isAdmin(window.PTCloud?.user);
  const canManage = () => isAdmin() && !PTIdentity.mustChange(PTCloud.user);
  const cloud = () => !!window.PTCloud?.enabled;
  const owner = () => cloud() ? PTCloud.user?.id : S.u.email;
  const bucket = () => PTCloud.client.storage.from('presentation-library');
  const status = (node, message) => { if (node?.isConnected) node.textContent = message; };
  const setupMessage = 'The presentation library is unavailable. The site owner needs to apply the library setup or check the connection.';
  async function rows() {
    if (!cloud()) {
      const response = await fetch('assets/library/catalog.json');
      if (!response.ok) throw Error(setupMessage);
      return response.json();
    }
    const { data, error } = await PTCloud.client.from('presentation_library').select('*').order('created_at', { ascending: false });
    if (error) throw Error(setupMessage);
    return data || [];
  }
  async function fileFor(row, preview = false) {
    const path = preview ? row.preview_path : row.file_path;
    if (row.source === 'builtin') {
      if (!/^assets\/library\/[a-z0-9-]+\.(pptx|pdf)$/.test(path || '')) throw Error('This library file is unavailable.');
      const response = await fetch(path);
      if (!response.ok) throw Error('Could not load this library file. Please retry.');
      return new File([await response.blob()], path.split('/').pop(), { type: preview ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
    }
    if (!cloud() || preview || !path?.startsWith(row.id + '/')) throw Error('This library file is unavailable.');
    const { data, error } = await bucket().download(path);
    if (error) throw Error('Could not load this library file. It may have been unpublished.');
    return new File([data], row.file_name, { type: /\.pdf$/i.test(row.file_name) ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
  }
  function download(file) {
    const url = URL.createObjectURL(file), a = document.createElement('a');
    a.href = url; a.download = file.name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  V.library = () => page('Presentation Library', 'No slides of your own? Choose a ready-made presentation and make it your next practice.',
    `<section class="pn library-panel"><label for="library-search">Find a presentation</label><input id="library-search" type="search" placeholder="Search titles, topics or descriptions"><p id="library-status" role="status">Loading presentations...</p><div class="library-grid" id="library-grid"></div></section>`);
  B.library = async () => {
    const root = $('library-grid'), note = $('library-status'), identity = owner(); let catalog;
    try { catalog = await rows(); } catch (e) { return status(note, e.message); }
    if (!root.isConnected || identity !== owner()) return;
    catalog = catalog.filter(row => row.published);
    function draw() {
      const query = $('library-search').value.trim().toLowerCase();
      const shown = catalog.filter(row => `${row.title} ${row.description} ${row.category}`.toLowerCase().includes(query));
      status(note, shown.length ? `${shown.length} presentation${shown.length === 1 ? '' : 's'} available. Choose one to see its slides.` : 'No presentations match. Try another search.');
      root.innerHTML = shown.map(row => `<article class="library-card"><span class="library-tag">${esc(row.category)}</span><h2>${esc(row.title)}</h2><p>${esc(row.description)}</p><small>${row.context?.pagesScanned || row.context?.pages?.length || '?'} slides · ${Math.round(row.target_seconds / 60)} minute practice · ${/\.pdf$/i.test(row.file_name) ? 'PDF' : 'PowerPoint'}</small><button class="bt" type="button" data-library-open="${esc(row.id)}">View presentation</button></article>`).join('');
      root.querySelectorAll('[data-library-open]').forEach(button => button.onclick = () => go('libraryDetail', catalog.find(row => row.id === button.dataset.libraryOpen)));
    }
    $('library-search').oninput = draw; draw();
  };
  podium.ext.PARENT.libraryDetail = 'library';
  V.libraryDetail = row => !row ? V.library() : page(esc(row.title), esc(row.description),
    `<section class="pn library-detail"><span class="library-tag">${esc(row.category)}</span><p>${Math.round(row.target_seconds / 60)} minute practice. ${row.preview_path || /\.pdf$/i.test(row.file_name) ? 'The slide layout is available in practice.' : 'PowerPoint practice uses a text-only preview.'}</p><div class="acts"><button class="bt" id="library-use" type="button">Use for practice</button><button class="bt gh" id="library-download" type="button">Download ${/\.pdf$/i.test(row.file_name) ? 'PDF' : 'PPTX'}</button></div><p id="library-action-status" role="status"></p><ol class="library-slides">${(row.context?.pages || []).map((text, i) => `<li><h3>Slide ${i + 1}</h3><p>${esc(text)}</p></li>`).join('')}</ol></section>`);
  B.libraryDetail = row => {
    if (!row || !$('library-use')) return;
    const note = $('library-action-status');
    $('library-download').onclick = async event => {
      const button = event.currentTarget; button.disabled = true;
      try { download(await fileFor(row)); status(note, 'Download ready.'); } catch (e) { status(note, e.message); }
      finally { button.disabled = false; }
    };
    $('library-use').onclick = async event => {
      if (isAdmin()) { status(note, 'Use a student account to record practice. Your admin account manages the library.'); return; }
      if (pendingEval()) { toast('Complete your speaking evaluation first, then choose a library presentation.'); go('eval'); return; }
      const existing = S.pres.find(p => p.libraryId === row.id);
      if (existing) { go('prac', existing.id); return; }
      const button = event.currentTarget, identity = owner(), uploaded = []; let added;
      button.disabled = true; status(note, 'Adding a copy to My Presentations...');
      try {
        const file = await fileFor(row), preview = row.preview_path ? await fileFor(row, true) : null;
        if (identity !== owner()) throw Error('Your account changed. Reopen the library.');
        const id = S.nid++, stem = identity + '/uploads/' + crypto.randomUUID(); let path = null, slidePath = null;
        if (cloud()) {
          path = stem + (/\.pdf$/i.test(file.name) ? '.pdf' : '.pptx');
          const result = await PTCloud.upload(path, file); if (result.error) throw Error('Could not add the presentation. ' + result.error); uploaded.push(path);
          if (preview) { slidePath = stem + '.slides.pdf'; const r = await PTCloud.upload(slidePath, preview); if (r.error) throw Error('Could not save the slide preview.'); uploaded.push(slidePath); }
        }
        if (identity !== owner()) throw Error('Your account changed. Reopen the library.');
        added = { id, libraryId: row.id, t: row.title, short: row.title, file: { name: file.name, size: file.size }, path, context: row.context,
          created: new Date().toISOString(), date: 'Not scheduled', time: '', target: row.target_seconds, ready: 0, ppt: /\.pptx$/i.test(file.name), rq: false, sp: true, final: false, left: null,
          ...(slidePath ? { slidePath, slideFile: { name: preview.name, size: preview.size } } : {}) };
        S.pres.push(added);
        if (cloud()) { const saved = await PTCloud.saveNow(podium.snapshot()); if (saved.error) throw Error('Could not save the presentation to your account. Please retry.'); } else podium.save();
        if (identity !== owner()) return;
        FILES[id] = file;
        if (button.isConnected) go('prac', id);
      } catch (e) {
        if (added && identity === owner()) S.pres = S.pres.filter(p => p !== added);
        if (uploaded.length && identity === owner()) await PTCloud.remove(uploaded).catch(() => {});
        status(note, e.message);
      } finally { button.disabled = false; }
    };
  };

  const credentialsForm = () => `<form id="admin-credentials" class="fr"><label for="admin-username">Admin username</label><input id="admin-username" autocomplete="username" required pattern="[a-z](?:[a-z0-9_]|-){2,31}" maxlength="32" value="${esc(PTIdentity.username(PTCloud.user))}"><label for="admin-current">Current password</label><input id="admin-current" type="password" autocomplete="current-password" required maxlength="128"><label for="admin-password">New password (at least 12 characters)</label><input id="admin-password" type="password" autocomplete="new-password" minlength="12" maxlength="128" required><label for="admin-confirm">Confirm new password</label><input id="admin-confirm" type="password" autocomplete="new-password" minlength="12" maxlength="128" required><button class="bt" type="submit">Save login credentials</button><p id="admin-credential-status" role="status"></p></form>`;
  V.admin = () => {
    if (!isAdmin()) return page('Admin Dashboard', '', '<p>Administrator access required.</p>');
    const forced = PTIdentity.mustChange(PTCloud.user);
    return page('Admin Dashboard', 'Manage the presentation library and your administrator login.',
      sec(forced ? 'SECURE YOUR ADMIN ACCOUNT' : 'LOGIN CREDENTIALS', 1, `<p>${forced ? 'Change the initial password before managing presentations.' : 'Change your username and password here. Your account and library ownership stay the same.'}</p>${credentialsForm()}`) + (forced ? '' :
      sec('ADD A LIBRARY PRESENTATION', 2, `<form id="admin-upload" class="fr"><label for="admin-title">Title</label><input id="admin-title" required minlength="2" maxlength="80"><label for="admin-description">Description</label><textarea id="admin-description" maxlength="500" rows="2"></textarea><label for="admin-category">Topic</label><input id="admin-category" required maxlength="40" value="General"><label for="admin-target">Practice length (minutes)</label><input id="admin-target" type="number" min="1" max="10" value="3" required><label for="admin-file">Presentation file (PPTX or PDF, up to 50 MB)</label><input id="admin-file" type="file" accept=".pptx,.pdf" required><p class="hint">PDF preserves the slide layout. PPTX provides a text preview in practice. Add content you have permission to share with students.</p><button class="bt" type="submit">Add as draft</button><p id="admin-upload-status" role="status"></p></form>`) +
      sec('LIBRARY PRESENTATIONS', 3, '<p id="admin-catalog-status" role="status">Loading library...</p><div id="admin-catalog" class="library-admin-list"></div>')));
  };
  async function loadParser(pdf) {
    if (pdf ? window.pdfjsLib : window.JSZip) return;
    await new Promise((resolve, reject) => { const script = document.createElement('script'); script.src = pdf ? 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js' : 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'; script.onload = resolve; script.onerror = () => reject(Error('Could not load the presentation reader. Retry when connected.')); document.head.appendChild(script); });
  }
  B.admin = async () => {
    if (!isAdmin() || !$('admin-credentials')) return;
    $('admin-credentials').onsubmit = async event => {
      event.preventDefault(); const form = event.currentTarget, button = form.querySelector('button'), note = $('admin-credential-status');
      const password = $('admin-password').value;
      if (password !== $('admin-confirm').value) return status(note, 'The new passwords do not match.');
      const username = $('admin-username').value.trim().toLowerCase();
      button.disabled = true; status(note, 'Updating your login...');
      try {
        const { data } = await PTCloud.client.auth.getSession();
        if (!data.session) throw Error('Please sign in again.');
        const response = await fetch('/api/admin', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + data.session.access_token }, body: JSON.stringify({ username, currentPassword: $('admin-current').value, password }) });
        const result = await response.json(); if (!response.ok) throw Error(result.message || 'Could not update your login.');
        // Reauthenticate with the changed credentials so refreshed claims unlock library writes.
        const signed = await PTCloud.client.auth.signInWithPassword({ email: PTIdentity.email(username), password });
        form.reset();
        if (signed.error) { status(note, 'Credentials saved. Sign out, then sign in with your new username and password.'); return; }
        PTCloud.user = signed.data.user; S.u.email = signed.data.user.email; go('admin'); toast('Admin login updated.');
      } catch (e) { status(note, e.message || 'Could not update your login. Please retry.'); }
      finally { button.disabled = false; }
    };
    if (!canManage()) return;
    const root = $('admin-catalog'), note = $('admin-catalog-status'), identity = owner();
    $('admin-upload').onsubmit = async event => {
      event.preventDefault(); const form = event.currentTarget, button = form.querySelector('button'), note = $('admin-upload-status'); let path;
      button.disabled = true; status(note, 'Reading presentation...');
      try {
        const { file } = PTPresentationContent.selectUpload($('admin-file').files), pdf = /\.pdf$/i.test(file.name);
        const title = $('admin-title').value.trim(), description = $('admin-description').value.trim(), category = $('admin-category').value.trim(), target = Number($('admin-target').value) * 60;
        await loadParser(pdf);
        if (pdf) pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        const context = await PTPresentationContent.scan(file, { pdf: window.pdfjsLib, zip: window.JSZip });
        if (!context.text.trim()) throw Error('This file has no readable slide text. Add selectable text before sharing it for practice.');
        if (owner() !== identity || !canManage()) throw Error('Your account changed. Sign in again.');
        const id = crypto.randomUUID(); path = id + '/presentation.' + (pdf ? 'pdf' : 'pptx');
        const uploaded = await bucket().upload(path, file, { contentType: pdf ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.presentationml.presentation', upsert: false });
        if (uploaded.error) throw Error('The library upload failed. Check your admin access and file size.');
        const saved = await PTCloud.client.from('presentation_library').insert({ id, title, description, category, target_seconds: target, source: 'upload', file_path: path, file_name: file.name, file_size: file.size, context, published: false });
        if (saved.error) throw Error('Could not save the library entry. Check its title, topic and duration.');
        path = null; if (form.isConnected && identity === owner()) { go('admin'); toast('Draft added. Publish it when ready.'); }
      } catch (e) { if (path && owner() === identity) await bucket().remove([path]).catch(() => {}); status(note, e.message); }
      finally { button.disabled = false; }
    };
    try {
      const catalog = await rows(); if (!root.isConnected || identity !== owner()) return;
      status(note, `${catalog.length} presentations · ${catalog.filter(row => row.published).length} published`);
      root.innerHTML = catalog.map(row => `<form class="library-editor" data-library-edit="${esc(row.id)}"><h3>${esc(row.title)} <small>${row.published ? 'Published' : 'Draft / hidden'}</small></h3><label>Title<input name="title" required minlength="2" maxlength="80" value="${esc(row.title)}"></label><label>Description<textarea name="description" maxlength="500">${esc(row.description)}</textarea></label><label>Topic<input name="category" maxlength="40" required value="${esc(row.category)}"></label><label>Practice length (minutes)<input name="minutes" type="number" min="1" max="10" required value="${row.target_seconds / 60}"></label><label><input name="published" type="checkbox"${row.published ? ' checked' : ''}> Published — visible to students</label><button class="bt" type="submit">Save presentation</button><p role="status"></p></form>`).join('');
      root.querySelectorAll('form').forEach(form => form.onsubmit = async event => {
        event.preventDefault(); const button = form.querySelector('button'), note = form.querySelector('[role=status]'), fields = form.elements;
        button.disabled = true; status(note, 'Saving...');
        try {
          const { data, error } = await PTCloud.client.from('presentation_library').update({ title: fields.title.value.trim(), description: fields.description.value.trim(), category: fields.category.value.trim(), target_seconds: Number(fields.minutes.value) * 60, published: fields.published.checked }).eq('id', form.dataset.libraryEdit).select('id');
          if (error || !data?.length) throw Error('Could not save. Check your admin access and the presentation details.');
          if (form.isConnected && identity === owner()) { go('admin'); toast('Library presentation updated.'); }
        } catch (e) { status(note, e.message); } finally { button.disabled = false; }
      });
    } catch (e) { status(note, e.message); }
  };
})();
