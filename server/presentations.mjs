import { ChatError } from './ai-access.mjs';
import { createPresentationConversion } from './presentation-conversion.mjs';
import { libraryPreview } from './library-preview.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fields = 'id,title,original_filename,original_file_path,preview_pdf_path,file_type,file_size,total_slides,conversion_status,conversion_error,error_code,warnings,upload_completed,attempts,manual_retries,retryable,available_at,conversion_consent_at,created_at,updated_at';
export function validatePresentationRequest(body) {
  if (!body || !['create','submit','status','list','retry','download','delete','usage','library-preview','library-prepare','library-retry'].includes(body.action)) throw new ChatError(400,'invalid_action','Choose a valid presentation action.');
  if (!['list','usage'].includes(body.action) && !UUID.test(body.id || '')) throw new ChatError(400,'invalid_id','Invalid presentation ID.');
  if (body.action === 'download' && !['original','preview'].includes(body.kind)) throw new ChatError(400,'invalid_download','Choose the original or preview.');
  if (body.action === 'create' && (typeof body.filename !== 'string' || body.filename.length > 240 || /[\x00-\x1f\x7f/\\]/.test(body.filename) ||
    !['pdf','pptx'].includes(body.type) || !body.filename.toLowerCase().endsWith('.'+body.type) || !Number.isSafeInteger(body.size) || body.size < 1 || body.size > 50000000 ||
    typeof body.title !== 'string' || body.title.trim().length < 2 || body.title.trim().length > 80)) throw new ChatError(400,'invalid_presentation','Choose a PDF or PPTX up to 50 MB and a title of 2 to 80 characters.');
  return body;
}

export function createPresentationsService({ env=process.env, fetchImpl=fetch, log=console, conversion }={}) {
  const coordinator=conversion||createPresentationConversion({env,fetchImpl,log});
  return async (authorization, payload) => {
    const body=validatePresentationRequest(payload);
    if (!/^Bearer \S{1,8192}$/i.test(authorization || '')) throw new ChatError(401,'unauthorized','Please sign in again.');
    if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) throw new ChatError(503,'setup_required','Presentation storage needs server setup.');
    const base=env.SUPABASE_URL.replace(/\/$/,''), headers={apikey:env.SUPABASE_ANON_KEY,Authorization:authorization,'Content-Type':'application/json'};
    const checked=await fetchImpl(base+'/auth/v1/user',{headers,signal:AbortSignal.timeout(8000)});
    if (!checked.ok) throw new ChatError(checked.status>=500?503:401,'unauthorized','Could not verify your account. Please sign in again.');
    const user=await checked.json();
    if (!UUID.test(user.id || '') || user.is_anonymous) throw new ChatError(401,'unauthorized','Sign in with a registered account.');
    if (body.action.startsWith('library-')) {
      if(body.action==='library-prepare' && body.cloudconvertConsent!==true) throw new ChatError(400,'conversion_consent_required','Agree to CloudConvert processing before preparing this PowerPoint preview.');
      return libraryPreview({body,user,conversion:coordinator});
    }
    const request=async(path,options={})=>{
      const response=await fetchImpl(base+path,{headers,...options,signal:AbortSignal.timeout(12000)});
      const data=await response.json().catch(()=>null);
      if (!response.ok) {
        if (data?.code==='P0002') throw new ChatError(404,'not_found','Presentation not found.');
        if (data?.code==='P0001') throw new ChatError(429,'presentation_limit','Presentation upload limit reached. Please try later or remove unused presentations.');
        if (data?.code==='42501') throw new ChatError(403,'evaluation_required','Complete your speaking evaluation before uploading.');
        if (data?.code==='22023') throw new ChatError(400,'invalid_state',data.message==='retry_not_allowed'?'This file cannot be retried. Check the original file or upload a new copy.':'The upload is incomplete or its metadata does not match. Retry uploading.');
        throw new ChatError(503,'storage_unavailable','Presentation storage is unavailable. Check the presentation conversion migration and retry.');
      }
      return data;
    };
    const rpc=(name,args)=>request('/rest/v1/rpc/'+name,{method:'POST',body:JSON.stringify(args)});
    const listPath='/rest/v1/presentations?select='+fields+'&user_id=eq.'+user.id+'&deleted_at=is.null&library_entry_id=is.null';
    const get=async()=>{const rows=await request(listPath+'&id=eq.'+body.id);if(!rows?.[0])throw new ChatError(404,'not_found','Presentation not found.');return rows[0];};
    const clean=row=>Object.fromEntries(fields.split(',').map(key=>[key,row[key]]));
    if(body.action==='usage')return {usage:await coordinator.usage()};
    if (body.action==='list') {
      let rows=await request(listPath+'&order=created_at.desc&limit=200');
      const pending=rows.find(row=>row.upload_completed&&['queued','processing'].includes(row.conversion_status)&&(row.file_type==='pdf'||row.conversion_consent_at)&&Date.parse(row.available_at)<=Date.now());
      if(pending){await coordinator.advance(pending.id);rows=await request(listPath+'&order=created_at.desc&limit=200');}
      return {presentations:rows};
    }
    if (body.action==='create') {
      if (!env.SUPABASE_SERVICE_ROLE_KEY || body.type==='pptx'&&!env.CLOUDCONVERT_API_KEY) throw new ChatError(503,'converter_setup_required','Presentation previews need server setup. Please contact the site owner.');
      if(body.type==='pptx'&&body.cloudconvertConsent!==true)throw new ChatError(400,'conversion_consent_required','Agree to CloudConvert processing for this PowerPoint first.');
      const row=await rpc('presentation_create',{p_id:body.id,p_title:body.title.trim(),p_filename:body.filename,p_type:body.type,p_size:body.size});
      if(body.type==='pptx'){const updated=await coordinator.db.patchPresentation(row.id,{conversion_consent_at:new Date().toISOString()});return {presentation:clean(updated[0])};}
      return {presentation:clean(row)};
    }
    const row=await get(); // RLS plus explicit owner filter, never a client-supplied path.
    if (body.action==='status') {if(row.upload_completed&&row.conversion_status!=='completed')await coordinator.advance(row.id);return {presentation:await get()};}
    if (body.action==='submit' || body.action==='retry') {
      if(row.file_type==='pptx'&&!row.conversion_consent_at){
        if(body.cloudconvertConsent!==true)throw new ChatError(400,'conversion_consent_required','Agree to CloudConvert processing for this PowerPoint first.');
        await coordinator.db.patchPresentation(row.id,{conversion_consent_at:new Date().toISOString()});
      }
      if(body.action==='retry'){
        if(!await coordinator.retry(row.id,user.id))throw new ChatError(409,'retry_not_allowed','This preview cannot be retried yet. Wait for the displayed retry time, or upload a PDF export.');
      }else{await rpc('presentation_submit',{p_id:body.id,p_retry:false});await coordinator.advance(body.id);}
      return {presentation:await get()};
    }
    if (body.action==='delete') {
      await rpc('presentation_delete',{p_id:body.id});
      try{await coordinator.cleanupDeleted()}catch{log.warn(JSON.stringify({event:'presentation_cleanup_deferred'}));}
      return {deleted:true};
    }
    if (body.action==='download') {
      if (body.kind==='preview' && row.conversion_status!=='completed') throw new ChatError(409,'preview_pending','The presentation preview is not ready yet.');
      const preview=body.kind==='preview' && row.file_type==='pptx',bucket=preview?'presentation-previews':'presentation-originals';
      const path=preview?row.preview_pdf_path:row.original_file_path;
      if (!path?.startsWith(user.id+'/') || path.includes('..')) throw new ChatError(503,'invalid_path','The presentation file is unavailable.');
      const signed=await request('/storage/v1/object/sign/'+bucket+'/'+path.split('/').map(encodeURIComponent).join('/'),{method:'POST',body:JSON.stringify({expiresIn:300})});
      if (!signed?.signedURL?.startsWith('/object/sign/')) throw new ChatError(503,'download_unavailable','Could not prepare a private download.');
      return {url:base+'/storage/v1'+signed.signedURL,filename:preview?row.original_filename.replace(/\.pptx$/i,'.pdf'):row.original_filename,expiresIn:300};
    }
  };
}
