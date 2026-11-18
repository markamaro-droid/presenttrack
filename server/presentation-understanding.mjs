import {createPresentationStorage} from './presentation-storage.mjs';
import {validatePptx,validatePdf,MAX_ORIGINAL} from './presentation-files.mjs';
import {structured,understandingSchema} from './learning-analysis.mjs';
import {ChatError} from './ai-access.mjs';
export async function extractSlides(row,{env,fetchImpl}){
  const storage=createPresentationStorage({env,fetchImpl});
  const bytes=await storage.download('presentation-originals',row.original_file_path,MAX_ORIGINAL);
  if(row.file_type==='pptx'){const result=await validatePptx(bytes,{includeText:true});return {slides:result.slides,limitations:['Images and scanned content are not interpreted. Chart text and speaker notes are included when embedded in the file.']}}
  await validatePdf(bytes);
  const pdf=await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task=pdf.getDocument({data:new Uint8Array(bytes),isEvalSupported:false,useSystemFonts:false,disableFontFace:true});
  try{const doc=await task.promise,slides=[];for(let number=1;number<=doc.numPages;number++){const page=await doc.getPage(number),text=await page.getTextContent();slides.push({number,text:text.items.map(i=>i.str||'').join(' ').slice(0,6000),notes:'',visualText:''});page.cleanup()}
    return {slides,limitations:['PDF text extraction has no OCR. Images, scanned pages, diagram meaning and speaker notes may be unavailable.']};
  }finally{await task.destroy()}
}
export async function prepareUnderstanding(store,user,id,{env,fetchImpl}){
  const row=await store.presentation(user,id);
  if(!row.upload_completed)throw new ChatError(409,'upload_pending','Finish uploading this presentation first.');
  let saved=(await store.list('presentation_understanding',user,'&presentation_id=eq.'+id))[0];
  if(saved?.status==='completed')return saved;
  const acquired=await store.rpc('claim_presentation_understanding',{p_user:user,p_id:id});
  if(!acquired)return saved||{status:'processing'};
  try{
    if(!await store.rpc('take_learning_slot',{p_user:user,p_kind:'understanding'}))throw new ChatError(429,'learning_limit','Content-analysis allowance reached. Retry later; prepared slides are retained.');
    const source=saved?.source||await extractSlides(row,{env,fetchImpl});
    const previous=saved?.analysis||{topic:row.title,objectives:[],slides:[],limitations:source.limitations};
    // Keep each request bounded for serverless timeouts and small provider quotas.
    const batch=source.slides.slice(previous.slides.length,previous.slides.length+4);
    if(!source.slides.some(s=>(s.text+s.notes+s.visualText).trim()))throw new ChatError(422,'no_text','No reliable text was found. Use a text-based PDF or PPTX; images are not invented or interpreted as text.');
    const next=await structured({env,fetchImpl,schema:understandingSchema,tokens:4000,prompt:'Analyze presentation content, not slide design. Preserve the input slide numbers and provide one item for EVERY supplied slide, including blank slides. Extract essential main points, terminology and examples grounded in the text, chart text and speaker notes. Prefer stated objectives; label inferred learning goals as inferred. Do not invent information from images. Keep uncertain or incomplete concepts explicitly limited. Use the supplied wider topic as context.',data:{title:row.title,topic:previous.topic,objectives:previous.objectives,slides:batch}});
    if(next.slides.length!==batch.length||next.slides.some((s,i)=>s.number!==batch[i].number))throw new ChatError(502,'invalid_analysis','Slide analysis returned mismatched slide numbers. Retry preparation.');
    const objectives=[...previous.objectives,...next.objectives].filter((o,i,a)=>a.findIndex(p=>p.text===o.text)===i).slice(0,20);
    const analysis={version:1,topic:previous.slides.length?previous.topic:next.topic,objectives,slides:[...previous.slides,...next.slides],limitations:[...new Set([...previous.limitations,...next.limitations])]};
    const status=analysis.slides.length===source.slides.length?'completed':'pending';
    return (await store.patch('presentation_understanding',user,'&presentation_id=eq.'+id,{source,analysis,status,error:null,lease_until:null,updated_at:new Date().toISOString()}))[0];
  }catch(error){await store.patch('presentation_understanding',user,'&presentation_id=eq.'+id,{status:'failed',error:error instanceof ChatError?error.message:'Presentation understanding could not finish. Retry preparation.',lease_until:null});throw error}
}
