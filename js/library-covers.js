/* First-slide cards reuse saved PDFs. No conversion is started by browsing. */
(() => {
  function mount(root, rows) {
    const owner = window.PTCloud?.user?.id, controller = new AbortController(), queue = [], seen = new WeakSet();
    let stopped = false, active = 0;
    const current = host => !stopped && root.isConnected && host.isConnected && window.PTCloud?.user?.id === owner;
    function message(host, text, retry = false) {
      host.replaceChildren(); host.removeAttribute('aria-busy');
      const line = document.createElement('span'); line.className = 'deck-cover-message'; line.textContent = text; host.append(line);
      if (retry) { const button = document.createElement('button'); button.className = 'deck-cover-retry'; button.type = 'button'; button.textContent = 'Reload preview'; button.onclick = () => { seen.delete(host); enqueue(host); }; host.append(button); }
    }
    function paint(host, row) {
      const image = document.createElement('img'); image.src = row.cover; image.alt = 'First slide of ' + row.title; image.decoding = 'async';
      image.onerror = () => { if (current(host)) { delete row.cover; message(host, 'Preview could not load', true); } };
      host.replaceChildren(image); host.removeAttribute('aria-busy');
    }
    async function render(host) {
      if (!current(host)) return;
      const row = rows.find(row => row.id === host.dataset.libraryCover); if (!row) return;
      if (row.cover) { paint(host, row); return; }
      host.setAttribute('aria-busy', 'true');
      try {
        let url;
        if (window.PTCloud?.enabled) {
          const { preview } = await PTPresentations.request('library-preview', row.id, { thumbnail: true }, controller.signal);
          if (!current(host)) return;
          if (preview.state !== 'completed') {
            message(host, preview.state === 'not_prepared' ? 'Slide preview has not been prepared yet' : preview.state === 'failed' ? 'Slide preview unavailable' : 'Slide preview is being prepared', preview.state !== 'not_prepared'); return;
          }
          url = preview.url;
        } else {
          url = row.preview_path || (/\.pdf$/i.test(row.file_name) ? row.file_path : null);
          if (!/^assets\/library\/[a-z0-9-]+\.pdf$/.test(url || '')) { message(host, 'Slide preview unavailable'); return; }
        }
        const response = await fetch(url, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(60000)]) });
        if (!response.ok) throw Error('Preview download failed');
        const file = new File([await response.blob()], 'preview.pdf', { type: 'application/pdf' });
        if (!current(host)) return;
        const cover = await PTPDF.cover(file, controller.signal);
        if (!current(host)) return;
        row.cover = cover; paint(host, row);
      } catch (error) { if (current(host) && error.name !== 'AbortError') message(host, 'Preview could not load', true); }
    }
    function drain() { while (!stopped && active < 2 && queue.length) { const host = queue.shift(); active++; render(host).finally(() => { active--; drain(); }); } }
    function enqueue(host) { if (!current(host) || seen.has(host)) return; seen.add(host); queue.push(host); drain(); }
    const observer = new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) enqueue(entry.target); }), { rootMargin: '200px' });
    root.querySelectorAll('[data-library-cover]').forEach(host => observer.observe(host));
    const navigation = new MutationObserver(() => { if (!root.isConnected || owner !== window.PTCloud?.user?.id || document.getElementById('app')?.hidden) destroy(); });
    navigation.observe(document.getElementById('app'), { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
    function destroy() { stopped = true; controller.abort(); observer.disconnect(); navigation.disconnect(); queue.length = 0; }
    return { destroy };
  }
  window.PTLibraryCovers = { mount };
})();
