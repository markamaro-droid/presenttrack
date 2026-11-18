/* PDF pages are painted by PDF.js; site typography never rebuilds slide content. */
(() => {
  const base='/assets/pdfjs/6.5.438/';
  let loading;
  async function load() {
    if (window.pdfjsLib) return window.pdfjsLib;
    if (!loading) loading=import(base+'legacy/build/pdf.min.mjs').then(pdf=>{
      pdf.GlobalWorkerOptions.workerSrc=base+'legacy/build/pdf.worker.min.mjs';
      window.pdfjsLib=pdf;return pdf;
    }).catch(()=>{loading=null;throw Error('The PDF viewer could not load. Check your connection and retry.');});
    return loading;
  }
  const options=data=>({data,isEvalSupported:false,cMapUrl:base+'cmaps/',cMapPacked:true,standardFontDataUrl:base+'standard_fonts/',wasmUrl:base+'wasm/',useSystemFonts:false});
  async function open(file) {
    const pdf=await load(),task=pdf.getDocument(options(new Uint8Array(await file.arrayBuffer())));
    let doc;
    try { doc=await task.promise; } catch (error) { await task.destroy?.();throw Error(error.name==='PasswordException'?'Remove PDF password protection before uploading.':'This PDF could not be opened. Check the original file and retry.'); }
    let rendering=null,version=0,disposed=false;
    return {
      n:doc.numPages,
      cancel(){version++;rendering?.cancel?.();rendering=null;},
      async destroy(){if(disposed)return;disposed=true;this.cancel();await task.destroy();},
      async show(index,host,maxHeight) {
        this.cancel();const current=version;
        const page=await doc.getPage(index+1);
        if(disposed||current!==version)throw new DOMException('Superseded render','AbortError');
        const box=page.getViewport({scale:1}),style=getComputedStyle(host);
        const width=Math.max(1,host.clientWidth-(parseFloat(style.paddingLeft)||0)-(parseFloat(style.paddingRight)||0));
        const scale=Math.min(width/box.width,Math.max(1,maxHeight)/box.height);
        const css=page.getViewport({scale}),ratio=Math.min(devicePixelRatio||1,2.5,Math.sqrt(16000000/(css.width*css.height)));
        const viewport=page.getViewport({scale:scale*ratio}),canvas=document.createElement('canvas');
        canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
        canvas.style.width=css.width+'px';canvas.style.height=css.height+'px';
        canvas.setAttribute('role','img');canvas.setAttribute('aria-label','Slide '+(index+1)+' of '+doc.numPages);
        rendering=page.render({canvasContext:canvas.getContext('2d'),viewport});
        await rendering.promise;
        if(disposed||current!==version)throw new DOMException('Superseded render','AbortError');
        rendering=null;return canvas;
      },
      async text() {
        const pages=[];let remaining=20000;
        for(let i=1;i<=Math.min(doc.numPages,100)&&remaining>0;i++){
          if(disposed)throw new DOMException('Closed PDF','AbortError');
          const page=await doc.getPage(i),content=await page.getTextContent();
          const text=content.items.map(item=>item.str||'').join(' ').replace(/\s+/g,' ').trim().slice(0,remaining);
          pages.push(text);remaining-=text.length;
        }
        return {text:pages.join('\n').slice(0,20000),pages,pagesScanned:pages.length,truncated:remaining<=0||doc.numPages>100};
      }
    };
  }
  async function cover(file,signal) {
    signal?.throwIfAborted();
    const deck=await open(file);
    const cancel=()=>deck.cancel();signal?.addEventListener('abort',cancel,{once:true});
    const host=document.createElement('div');host.style.cssText='position:fixed;left:-10000px;top:0;width:800px;visibility:hidden;pointer-events:none';
    document.body.appendChild(host);
    try{
      signal?.throwIfAborted();
      const canvas=await deck.show(0,host,600);
      signal?.throwIfAborted();
      const out=document.createElement('canvas'),scale=Math.min(1,800/canvas.width,800/canvas.height);
      out.width=Math.max(1,Math.round(canvas.width*scale));out.height=Math.max(1,Math.round(canvas.height*scale));
      out.getContext('2d').drawImage(canvas,0,0,out.width,out.height);
      return out.toDataURL('image/jpeg',.86);
    }finally{signal?.removeEventListener('abort',cancel);host.remove();await deck.destroy();}
  }
  window.PTPDF={load,open,options,cover};
})();
