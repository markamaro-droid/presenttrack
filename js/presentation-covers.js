/* First-page covers use the saved display PDF. No conversion jobs are created here. */
(() => {
  function mount({root, presentations, loadFile, isCurrent, save}) {
    const controller=new AbortController(),visible=new Set(),queued=new Set(),failed=new Set(),painted=new WeakSet(),queue=[];
    let stopped=false,active=0;
    const alive=host=>!stopped&&isCurrent()&&host.isConnected;
    const presentation=host=>presentations().find(p=>String(p.id)===host.dataset.deckCover);
    const ready=p=>p?.file&&(!p.remoteId||p.conversion?.conversion_status==='completed');
    function message(host,text,retry=false) {
      host.replaceChildren();host.removeAttribute('aria-busy');delete host.dataset.state;
      const line=document.createElement('span');line.className='deck-cover-message';line.textContent=text;host.append(line);
      if(retry){const button=document.createElement('button');button.type='button';button.className='deck-cover-retry';button.textContent='Reload preview';
        button.onclick=()=>{failed.delete(host);enqueue(host)};host.append(button);}
    }
    function paint(host,p) {
      const img=document.createElement('img');img.src=p.thumb;img.alt='First slide of '+p.t;img.decoding='async';
      img.onerror=()=>{if(alive(host)){delete p.thumb;failed.add(host);message(host,'Preview could not load',true)}};
      host.replaceChildren(img);host.removeAttribute('aria-busy');host.dataset.state='ready';painted.add(host);
    }
    function enqueue(host) {
      if(!alive(host)||queued.has(host)||failed.has(host))return;
      const p=presentation(host);if(!p)return;
      if(p.thumb){if(!painted.has(host))paint(host,p);return;}
      if(!ready(p)){
        const status=p.conversion?.conversion_status;
        message(host,!p.file?'Add slides when you’re ready':status==='failed'?'Preview unavailable':p.remoteId?'Preparing your first slide…':'No slide preview yet');
        return;
      }
      queued.add(host);queue.push(host);drain();
    }
    async function render(host) {
      const p=presentation(host);if(!p||!alive(host))return;
      message(host,'Loading first slide…');host.setAttribute('aria-busy','true');
      try{
        const file=await loadFile(p,controller.signal);
        if(!alive(host))return;
        if(!file){message(host,'Open Practice to prepare a preview');return;}
        const thumb=await PTPDF.cover(file,controller.signal);
        if(!alive(host)||!presentations().includes(p))return;
        p.thumb=thumb;paint(host,p);save();
      }catch(error){if(alive(host)&&error.name!=='AbortError'){failed.add(host);message(host,'Preview could not load',true)}}
    }
    function drain(){
      while(!stopped&&active<2&&queue.length){const host=queue.shift();active++;
        render(host).finally(()=>{active--;queued.delete(host);drain()});}
    }
    const observer=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{
      for(const entry of entries){if(entry.isIntersecting){visible.add(entry.target);enqueue(entry.target)}else visible.delete(entry.target)}
    },{rootMargin:'240px'}):null;
    root.querySelectorAll('[data-deck-cover]').forEach(host=>{
      if(observer)observer.observe(host);else{visible.add(host);enqueue(host)}
    });
    root.addEventListener('click',event=>{
      root.querySelectorAll('.deck-menu[open]').forEach(menu=>{if(!menu.contains(event.target))menu.open=false});
    },{signal:controller.signal});
    root.addEventListener('keydown',event=>{
      const menu=event.target.closest('.deck-menu[open]');
      if(event.key==='Escape'&&menu){menu.open=false;menu.querySelector('summary').focus();event.stopPropagation()}
    },{signal:controller.signal});
    return {
      refresh(){for(const host of visible)enqueue(host)},
      destroy(){stopped=true;controller.abort();observer?.disconnect();queue.length=0;visible.clear()}
    };
  }
  window.PTPresentationCovers={mount};
})();
