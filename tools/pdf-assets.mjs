import { cp, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export const pdfVersion='6.5.438';
export const pdfRoot=fileURLToPath(new URL('../node_modules/pdfjs-dist/',import.meta.url));
export const pdfAsset=/^assets\/pdfjs\/6\.5\.438\/(legacy\/build\/pdf(?:\.worker)?\.min\.mjs|(?:cmaps|standard_fonts|wasm)\/[\w.-]+)$/;
export async function stagePdfAssets(output){
  const installed=JSON.parse(await readFile(path.join(pdfRoot,'package.json'),'utf8'));
  if(installed.version!==pdfVersion)throw Error('PDF.js and its worker must use the same pinned version. Run npm ci.');
  const target=path.join(output,'assets','pdfjs',pdfVersion);
  await mkdir(path.join(target,'legacy','build'),{recursive:true});
  for(const name of ['pdf.min.mjs','pdf.worker.min.mjs'])await cp(path.join(pdfRoot,'legacy','build',name),path.join(target,'legacy','build',name));
  for(const name of ['cmaps','standard_fonts','wasm','LICENSE'])await cp(path.join(pdfRoot,name),path.join(target,name),{recursive:true});
}
