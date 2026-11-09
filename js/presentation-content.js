/* Read-only extraction. Original File objects are uploaded and retained unchanged. */
(() => {
  const limit=20000;
  const supported=name=>/\.(pdf|pptx)$/i.test(name||'');
  async function scan(file,{pdf,zip}={}) {
    if(!supported(file?.name))throw new Error('Choose a PPTX or PDF only file.');
    if(file.size>50000000)throw new Error('Choose a presentation up to 50 MB.');
    const pages=[];let length=0;
    const add=text=>{const remaining=limit-length;if(remaining<=0)return;const value=String(text).replace(/\s+/g,' ').trim().slice(0,remaining);pages.push(value);length+=value.length;};
    if(/\.pdf$/i.test(file.name)) {
      const doc=await pdf.getDocument({data:await file.arrayBuffer()}).promise;
      try {for(let i=1;i<=Math.min(doc.numPages,100)&&length<limit;i++){const page=await doc.getPage(i);const content=await page.getTextContent();add(content.items.map(x=>x.str||'').join(' '));}}
      finally {await doc.destroy?.();}
    } else if(/\.pptx$/i.test(file.name)) {
      const archive=await zip.loadAsync(await file.arrayBuffer());
      const names=Object.keys(archive.files).filter(n=>/^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a,b)=>Number(a.match(/slide(\d+)/)[1])-Number(b.match(/slide(\d+)/)[1]));
      if(!names.length)throw new Error('This file is not a readable PPTX presentation.');
      for(const name of names.slice(0,100)) {
        if(length>=limit)break;
        if(archive.file(name)._data?.uncompressedSize>2000000)throw new Error('Slide content exceeds the scan limit.');
        const xml=new DOMParser().parseFromString(await archive.file(name).async('string'),'application/xml');
        add([...xml.getElementsByTagName('a:p')].map(p=>[...p.getElementsByTagName('a:t')].map(t=>t.textContent).join('')).join('\n'));
      }
    }
    return {text:pages.join('\n').slice(0,limit),pagesScanned:pages.length,truncated:length>=limit};
  }
  globalThis.PTPresentationContent={supported,scan};
})();
