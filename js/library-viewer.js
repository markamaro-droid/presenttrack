/* The Library uses the same PDF.js renderer as practice; no HTML slide rebuild. */
(() => {
  const html = () => `<section class="library-preview" id="library-preview" aria-label="Presentation preview">
    <div class="library-preview-stage" id="library-preview-stage" aria-busy="true"><p role="status">Loading slide preview…</p></div>
    <div class="library-preview-controls"><div class="acts"><button class="bt gh" type="button" data-library-page="-1" aria-label="Previous slide" disabled>Previous</button><span id="library-preview-page" aria-live="polite">Slide preview</span><button class="bt gh" type="button" data-library-page="1" aria-label="Next slide" disabled>Next</button></div><button class="bt gh" id="library-preview-fullscreen" type="button" disabled>Full screen</button></div>
    <p class="library-preview-note" id="library-preview-note"></p></section>`;

  function mount({ row, canManage, loadLocal }) {
    const root = document.getElementById('library-preview'); if (!root) return;
    const stage = root.querySelector('#library-preview-stage'), pageLabel = root.querySelector('#library-preview-page'), note = root.querySelector('#library-preview-note');
    const fullscreen = root.querySelector('#library-preview-fullscreen'), buttons = [...root.querySelectorAll('[data-library-page]')];
    const controller = new AbortController(), owner = window.PTCloud?.user?.id;
    let deck, index = 0, stopped = false, busy = false, polling, resizing;
    const current = () => !stopped && root.isConnected && podium.ext.S.view === 'libraryDetail' && window.PTCloud?.user?.id === owner;
    const dispose = () => { if (stopped) return; stopped = true; controller.abort(); clearTimeout(polling); clearTimeout(resizing); resize.disconnect(); navigation.disconnect(); deck?.destroy().catch(() => {}); };
    const controls = () => {
      buttons.forEach(button => button.disabled = !deck || (Number(button.dataset.libraryPage) < 0 ? index === 0 : index === deck.n - 1));
      fullscreen.disabled = !deck || !root.requestFullscreen;
      pageLabel.textContent = deck ? `Slide ${index + 1} of ${deck.n}` : 'Slide preview';
    };
    const errorText = error => error.name === 'TimeoutError' ? 'The preview took too long to load. Please retry.' : error.message || 'The slide preview could not load. Please retry.';
    function message(text, action, label = 'Retry preview') {
      stage.replaceChildren(); stage.setAttribute('aria-busy', 'false');
      const box = document.createElement('div'); box.className = 'library-preview-message';
      const line = document.createElement('p'); line.setAttribute('role', 'status'); line.textContent = text; box.append(line);
      if (action) { const button = document.createElement('button'); button.type = 'button'; button.className = 'bt'; button.textContent = label; button.onclick = action; box.append(button); }
      stage.append(box); return box;
    }
    function prepare() {
      const box = message('Prepare the original slide layout for this PowerPoint. The saved PDF will be reused whenever this Library preview is opened.');
      const label = document.createElement('label'); label.className = 'library-preview-consent';
      const check = document.createElement('input'); check.type = 'checkbox';
      label.append(check, document.createTextNode(' I agree to send this PowerPoint to CloudConvert to prepare its preview using the shared conversion allowance.'));
      const button = document.createElement('button'); button.className = 'bt'; button.type = 'button'; button.textContent = 'Prepare slide preview'; button.disabled = true;
      check.onchange = () => button.disabled = !check.checked;
      button.onclick = () => { if (check.checked) refresh('library-prepare', { cloudconvertConsent: true }); };
      box.append(label, button);
    }
    async function paint() {
      if (!current()) return dispose(); if (!deck) return;
      stage.setAttribute('aria-busy', 'true'); controls();
      try {
        const canvas = await deck.show(index, stage, Math.max(1, stage.clientHeight - 32));
        if (!current()) return dispose();
        stage.replaceChildren(canvas); stage.setAttribute('aria-busy', 'false');
      } catch (error) {
        if (current() && !['AbortError', 'RenderingCancelledException'].includes(error.name)) message(errorText(error), paint);
      }
    }
    async function showFile(file) {
      const opened = await PTPDF.open(file);
      if (!current()) { await opened.destroy(); dispose(); return; }
      if (deck) await deck.destroy(); deck = opened; index = 0; await paint();
    }
    async function refresh(action = 'library-preview', extra = {}) {
      if (!current()) return dispose(); if (busy) return;
      busy = true; clearTimeout(polling); message(action === 'library-prepare' ? 'Preparing your slide preview…' : 'Loading slide preview…'); stage.setAttribute('aria-busy', 'true');
      try {
        if (!window.PTCloud?.enabled) { await showFile(await loadLocal()); return; }
        const { preview } = await PTPresentations.request(action, row.id, extra, controller.signal);
        if (!current()) return dispose();
        if (preview.state === 'completed') {
          const response = await fetch(preview.url, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(60000)]) });
          if (!response.ok) throw Error('The private preview link could not load. Retry to get a fresh link.');
          const blob = await response.blob(); if (!current()) return dispose();
          await showFile(new File([blob], 'library-preview.pdf', { type: 'application/pdf' }));
        } else if (preview.state === 'not_prepared') {
          if (canManage && preview.canPrepare) prepare(); else message('The administrator is preparing the visual preview for this presentation. You can still download the original file.');
        } else if (preview.state === 'failed') {
          message(preview.message || 'This PowerPoint preview could not be prepared. Try again or upload a PDF exported from PowerPoint.', preview.retryable ? () => refresh('library-retry') : undefined);
        } else {
          const next = Date.parse(preview.nextCheckAt), waiting = Number.isFinite(next) && next > Date.now() + 10000;
          message(preview.message || 'Preparing your original slide layout. You can leave this page and return when it is ready.');
          if (waiting) {
            const line = document.createElement('small'); line.textContent = 'Next check: ' + new Date(next).toLocaleString(); stage.firstElementChild.append(line);
          }
          polling = setTimeout(() => refresh(), waiting ? Math.min(2147480000, Math.max(4000, next - Date.now())) : 4000);
        }
      } catch (error) {
        if (current() && error.name !== 'AbortError') message(errorText(error), () => refresh());
      } finally { busy = false; if (current()) stage.setAttribute('aria-busy', 'false'); }
    }
    buttons.forEach(button => button.onclick = () => { if (!deck) return; index = Math.max(0, Math.min(deck.n - 1, index + Number(button.dataset.libraryPage))); paint(); });
    fullscreen.onclick = async () => {
      try { if (document.fullscreenElement === root) await document.exitFullscreen(); else await root.requestFullscreen(); }
      catch { note.textContent = 'Full screen is unavailable in this browser. You can still browse the slides here.'; }
    };
    document.addEventListener('fullscreenchange', () => { fullscreen.textContent = document.fullscreenElement === root ? 'Exit full screen' : 'Full screen'; paint(); }, { signal: controller.signal });
    root.addEventListener('keydown', event => {
      if (!deck || /INPUT|TEXTAREA/.test(event.target.tagName) || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault(); index = Math.max(0, Math.min(deck.n - 1, index + (event.key === 'ArrowLeft' ? -1 : 1))); paint();
    }, { signal: controller.signal });
    const resize = new ResizeObserver(() => { clearTimeout(resizing); resizing = setTimeout(paint, 120); }); resize.observe(stage);
    const navigation = new MutationObserver(() => { if (!current() || document.getElementById('app')?.hidden) dispose(); });
    navigation.observe(document.getElementById('app'), { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
    note.textContent = /\.pptx$/i.test(row.file_name) ? 'PowerPoint is shown as a PDF. Unavailable fonts, animations and unsupported effects may differ from the original.' : 'Original PDF layout. Use Previous and Next to browse the pages.';
    refresh();
    return { destroy: dispose };
  }
  window.PTLibraryViewer = { html, mount };
})();
