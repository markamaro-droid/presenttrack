import {DocumentError,MAX_ORIGINAL,MAX_PREVIEW,validatePdf,validatePptx} from './presentation-files.mjs';
import {createCloudConvertClient,DAILY_CREDITS,RESERVED_CREDITS} from './cloudconvert-client.mjs';
import {createPresentationStorage,UUID} from './presentation-storage.mjs';

const quotaError=error=>error.status===402||/^(CREDITS_EXCEEDED|QUOTA_EXCEEDED|DAILY_LIMIT_EXCEEDED|CONVERSION_LIMIT_REACHED)$/.test(error.code||'');
const nextDay=()=>{const day=new Date();day.setUTCDate(day.getUTCDate()+1);day.setUTCHours(0,5,0,0);return day.toISOString()};
const later=seconds=>new Date(Date.now()+seconds*1000).toISOString();
const tag=c=>'pt-'+c.id+'-'+c.attempt_id;
const usageOf=job=>{
  const tasks=job.tasks||[],convert=tasks.find(task=>task.operation==='convert');
  return Number.isInteger(convert?.credits)?Math.min(100,tasks.reduce((total,task)=>total+(Number.isInteger(task.credits)?Math.max(0,task.credits):0),0)):RESERVED_CREDITS;
};
export function createPresentationConversion({env=process.env,fetchImpl=fetch,storage,provider,log=console}={}){
  const db=storage||createPresentationStorage({env,fetchImpl}),cloud=provider||createCloudConvertClient({env,fetchImpl});

  async function processCache(id,{cleanup=false}={}){
    let c=await db.cache(id);if(!c)return {done:true};
    await db.rpc('presentation_cloud_sync',{p_id:id});
    // Viewing a completed presentation never contacts CloudConvert again.
    if(c.state==='completed'&&!cleanup)return {done:true};
    const claims=await db.rpc('presentation_cloud_lock',{p_id:id});if(!claims.length)return {busy:true};c=claims[0];const token=c.lock_token;
    const patch=async value=>{c=await db.patchCache(id,token,value);return c};
    const sync=()=>db.rpc('presentation_cloud_sync',{p_id:id});
    const settle=async credits=>{if(!await db.rpc('presentation_cloud_settle',{p_id:id,p_token:token,p_credits:credits}))throw Error('Conversion lease lost');c.reservation_settled=true;c.credits_used=credits};
    const removeProvider=async()=>{
      if(c.provider_deleted)return;
      if(!c.provider_job_id){
        // An uncertain POST may still have a remote job. Keep it discoverable.
        if(!c.dispatch_started_at)await patch({provider_deleted:true});
        return;
      }
      try{await cloud.remove(c.provider_job_id)}catch(error){if(error.status!==404)throw error}
      await patch({provider_deleted:true});
    };
    const deferQuota=async()=>{
      await settle(0);await removeProvider();
      await patch({state:'queued',attempt_id:null,dispatch_started_at:null,provider_job_id:null,provider_deleted:false,
        error_code:'daily_quota',error:'The shared free conversion allowance is unavailable. Your original is saved; the app will check again tomorrow.',next_attempt_at:nextDay(),poll_after:nextDay()});await sync();
    };
    try{
      if(c.retired_at){
        if(!c.provider_job_id&&c.dispatch_started_at){
          const found=(await cloud.find(tag(c))).find(job=>job.tag===tag(c)&&UUID.test(job.id));
          if(found)await patch({provider_job_id:found.id});
          else if(Date.now()-Date.parse(c.dispatch_started_at)<60*60*1000)return {busy:true};
        }
        await removeProvider();if(!c.reservation_settled)await settle(RESERVED_CREDITS);
        await db.remove('presentation-previews',[c.user_id+'/cache/'+c.id+'.pdf']);
        await db.json('/rest/v1/presentation_conversion_cache?id=eq.'+id+'&retired_at=not.is.null&lock_token=eq.'+token,{method:'DELETE'});return {done:true};
      }
      if(c.state==='completed'||c.state==='failed'){
        if(!c.provider_job_id&&c.dispatch_started_at){
          const found=(await cloud.find(tag(c))).find(job=>job.tag===tag(c)&&UUID.test(job.id));
          if(found)await patch({provider_job_id:found.id});
          else {await patch({poll_after:later(3600)});return {waiting:true};}
        }
        await removeProvider();return {done:true};
      }
      if(new Date(c.next_attempt_at)>new Date())return {waiting:true};
      const references=await db.json('/rest/v1/presentations?select=id&conversion_id=eq.'+id+'&deleted_at=is.null&limit=1');
      if(!references.length)return {waiting:true};
      if(c.state==='queued'){
        if(!await db.rpc('presentation_cloud_reserve',{p_id:id,p_token:token}))return {waiting:true};
        c=await db.cache(id);
      }
      if(!c.provider_job_id&&c.dispatch_started_at){
        // POST is deliberately never blindly retried: CloudConvert does not
        // document an idempotency key. Reconcile the persisted unique tag.
        const matches=await cloud.find(tag(c));
        const jobs=matches.filter(job=>job.tag===tag(c)&&UUID.test(job.id));
        if(jobs.length===1)await patch({provider_job_id:jobs[0].id,state:'processing'});
        else {
          if(Date.now()-Date.parse(c.dispatch_started_at)>60*60*1000){
            await settle(RESERVED_CREDITS);
            await patch({state:'failed',retryable:false,error_code:'submission_uncertain',error:'The conversion request could not be confirmed. No duplicate was sent. Contact the site owner or upload a PowerPoint PDF export.',poll_after:later(300)});await sync();
          }else {await patch({error_code:'confirming_job',error:'Confirming the conversion request before sending anything else.',poll_after:later(30)});await sync();}
          return {waiting:true};
        }
      }
      if(!c.provider_job_id){
        // No create request has been sent yet, so errors here are safe to retry.
        try{
          const balance=await cloud.balance();
          await db.json('/rest/v1/presentation_conversion_usage?day=eq.'+c.quota_day,{method:'PATCH',body:{provider_remaining:balance,checked_at:new Date().toISOString()}});
          // The user endpoint does not label free vs purchased allowances.
          // Record its balance, but let quota responses and our atomic budget
          // govern Free-account jobs (a zero reported balance is not enough).
          if(!c.original_file_path.startsWith(c.user_id+'/')||c.original_file_path.includes('..'))throw new DocumentError('invalid_path','The original file is unavailable.');
          const url=await db.sign('presentation-originals',c.original_file_path,1200);
          await patch({dispatch_started_at:new Date().toISOString(),state:'starting'});await sync();
          let job;
          try{job=await cloud.create(tag(c),url)}catch(error){
            if(quotaError(error)){await deferQuota();return {waiting:true};}
            if(error.status===429){await settle(0);await patch({state:'queued',attempt_id:null,dispatch_started_at:null,error_code:'provider_busy',error:'The conversion service is busy. The saved job will retry shortly.',next_attempt_at:later(Math.max(60,error.retryAfter||0)),poll_after:later(Math.max(60,error.retryAfter||0))});await sync();return {waiting:true};}
            if(error.status>=400&&error.status<500&&error.status!==408){await settle(0);await patch({state:'failed',dispatch_started_at:null,provider_deleted:true,error_code:'provider_rejected',error:'CloudConvert could not accept this job. Check the API configuration or upload a PDF export.',retryable:true});await sync();return {done:true};}
            // A network/5xx error may have created a job. Preserve the attempt.
            throw error;
          }
          if(!UUID.test(job?.id)||job.tag!==tag(c))throw Error('Unexpected job creation response');
          await patch({provider_job_id:job.id,state:'processing',poll_after:later(8),error:null,error_code:null});await sync();return {waiting:true};
        }catch(error){
          if(!c.dispatch_started_at){
            await settle(0);
            if(error instanceof DocumentError)throw error;
            await patch({state:'queued',attempt_id:null,error_code:'provider_unavailable',error:'Conversion service is unavailable. Your file is saved; the app will retry.',next_attempt_at:later(300),poll_after:later(300)});await sync();return {waiting:true};
          }
          throw error;
        }
      }
      let job;
      try{job=await cloud.get(c.provider_job_id)}catch(error){
        if(error.status!==404)throw error;
        // A valid preview may already have reached Storage before a timeout.
        const name=c.user_id+'/cache/'+c.id+'.pdf';let result;
        try{
          const bytes=await db.download('presentation-previews',name,MAX_PREVIEW);result=await validatePdf(bytes,MAX_PREVIEW);
          if(result.pages!==c.source_slides)throw Error('Slide count mismatch');
        }catch{
          await settle(RESERVED_CREDITS);await patch({state:'failed',retryable:false,error_code:'provider_expired',error:'The temporary conversion result expired before it could be saved. Upload a PDF export or contact the site owner.',provider_deleted:true});await sync();return {done:true};
        }
        await settle(RESERVED_CREDITS);await patch({state:'completed',preview_pdf_path:name,total_slides:result.pages,error:null,error_code:null,provider_deleted:true});await sync();return {done:true};
      }
      if(job.id!==c.provider_job_id||job.tag!==tag(c))throw Error('Conversion identity mismatch');
      if(job.status==='error'){
        const failed=(job.tasks||[]).find(task=>task.status==='error'&&!/INPUT_TASK_FAILED/.test(task.code||''))||{};
        if(quotaError(failed)){await deferQuota();return {waiting:true};}
        const convert=(job.tasks||[]).find(task=>task.operation==='convert'),charged=convert?.status==='finished';
        await settle(charged?usageOf(job):0);
        await patch({state:'failed',retryable:!charged&&!/INVALID|PASSWORD|UNSUPPORTED|FILE_TOO_LARGE/i.test(failed.code||''),
          error_code:'conversion_failed',error:charged?'The conversion finished but its export failed. No new conversion was started. Use a PDF export or contact the site owner.':'CloudConvert could not convert this PowerPoint within the supported limits. Retry or upload a PDF exported from PowerPoint.',poll_after:later(15)});
        await sync();await removeProvider();return {done:true};
      }
      if(job.status!=='finished'){
        if(Date.now()-Date.parse(c.dispatch_started_at)>30*60*1000){
          await removeProvider();await settle(RESERVED_CREDITS);await patch({state:'failed',retryable:true,error_code:'conversion_timeout',error:'Conversion took too long. Your original is saved. Retry later or upload a PDF export.'});await sync();return {done:true};
        }
        await patch({state:'processing',poll_after:later(10),error:null,error_code:null});await sync();return {waiting:true};
      }
      await settle(usageOf(job));
      const output=job.tasks?.find(task=>task.operation==='export/url'&&task.name==='export-pdf'&&task.status==='finished')?.result?.files;
      if(!Array.isArray(output)||output.length!==1||!/\.pdf$/i.test(output[0].filename||''))throw new DocumentError('invalid_output','CloudConvert did not return a single PDF preview. Upload a PDF export.');
      const bytes=await cloud.download(output[0].url,MAX_PREVIEW),result=await validatePdf(bytes,MAX_PREVIEW);
      if(result.pages!==c.source_slides)throw new DocumentError('slide_count_mismatch','The preview has a different slide count. Upload a PDF export from PowerPoint to preserve every slide.');
      const name=c.user_id+'/cache/'+c.id+'.pdf';
      if(!await db.upload(name,bytes)){
        const existing=await validatePdf(await db.download('presentation-previews',name,MAX_PREVIEW),MAX_PREVIEW);
        if(existing.pages!==c.source_slides)throw Error('Cached preview mismatch');
      }
      await patch({state:'completed',preview_pdf_path:name,total_slides:result.pages,error:null,error_code:null,poll_after:later(15)});await sync();
      await removeProvider();return {done:true};
    }catch(error){
      log.warn(JSON.stringify({event:'cloudconvert_progress_deferred',cache:id,code:error instanceof DocumentError?error.code:'service_unavailable'}));
      if(error instanceof DocumentError){await patch({state:'failed',error:error.message,error_code:error.code,retryable:false});await sync();await removeProvider();return {done:true};}
      await patch({poll_after:later(30)}).catch(()=>{});return {busy:true};
    }finally{
      await db.patchCache(id,token,{lock_token:null,lock_until:null}).catch(()=>{});
    }
  }

  async function advance(id){
    let p=await db.presentation(id);if(!p||p.deleted_at||p.conversion_status==='completed')return;
    if(p.conversion_id)return processCache(p.conversion_id);
    if(!p.upload_completed)return;
    if(p.file_type==='pptx'&&!p.conversion_consent_at){await db.patchPresentation(id,{error_code:'consent_required',conversion_error:'CloudConvert processes PowerPoint files to prepare previews. Continue only if you agree to send this file.'});return;}
    const claims=await db.rpc('presentation_validation_claim',{p_id:id});if(!claims.length)return;p=claims[0];
    try{
      if(p.original_file_path!==p.user_id+'/'+p.id+'.'+p.file_type)throw new DocumentError('invalid_path','The original file is unavailable.');
      const bytes=await db.download('presentation-originals',p.original_file_path,MAX_ORIGINAL);
      if(bytes.length!==p.file_size)throw new DocumentError('file_size','The stored original size does not match. Upload it again.');
      if(p.file_type==='pdf'){
        const result=await validatePdf(bytes);
        await db.rpc('presentation_finish',{p_id:id,p_token:p.lease_token,p_pages:result.pages,p_path:null,p_warnings:[]});return;
      }
      const result=await validatePptx(bytes),cache=await db.rpc('presentation_cloud_bind',{p_id:id,p_token:p.lease_token,p_hash:result.hash,p_slides:result.pages,p_warnings:result.warnings});
      if(cache)return processCache(cache);
    }catch(error){
      await db.patchPresentation(id,{conversion_status:error instanceof DocumentError?'failed':'queued',retryable:false,
        conversion_error:error instanceof DocumentError?error.message:'Checking the original was interrupted. The app will retry shortly.',error_code:error instanceof DocumentError?error.code:'validation_pending',
        lease_token:null,lease_until:error instanceof DocumentError?null:later(30)},p.lease_token);
    }
  }

  async function usage(){
    const day=new Date().toISOString().slice(0,10),row=(await db.json('/rest/v1/presentation_conversion_usage?day=eq.'+day+'&select=reserved,spent,provider_remaining,checked_at'))[0];
    return {dailyLimit:DAILY_CREDITS,spent:row?.spent||0,reserved:row?.reserved||0,available:Math.max(0,DAILY_CREDITS-(row?.spent||0)-(row?.reserved||0)),providerRemaining:row?.provider_remaining??null,checkedAt:row?.checked_at??null,nextCheckAt:nextDay(),shared:true};
  }
  async function retry(id,user){
    if(!await db.rpc('presentation_cloud_retry',{p_id:id,p_user:user}))return false;
    await advance(id);return true;
  }
  async function webhook(job){
    if(!UUID.test(job?.id)||typeof job.tag!=='string'||!/^pt-[a-f0-9-]{36}-[a-f0-9-]{36}$/i.test(job.tag))return {done:true};
    const attempt=job.tag.slice(-36),rows=await db.json('/rest/v1/presentation_conversion_cache?attempt_id=eq.'+attempt+'&select=*');
    if(!rows[0]||tag(rows[0])!==job.tag||rows[0].provider_job_id&&rows[0].provider_job_id!==job.id)return {done:true};
    // Re-fetch provider state; callback URLs and statuses are never trusted.
    return processCache(rows[0].id,{cleanup:true});
  }
  async function cleanupDeleted(){
    const rows=await db.rpc('presentation_cleanup_candidates');
    for(const p of rows){
      if(p.original_file_path!==p.user_id+'/'+p.id+'.'+p.file_type)continue;
      if(p.conversion_id){
        await db.rpc('presentation_cloud_retire',{p_id:p.conversion_id});
        const c=await db.cache(p.conversion_id);
        if(c?.retired_at)await processCache(c.id,{cleanup:true});
        const remaining=await db.cache(p.conversion_id);
        if(remaining&&remaining.original_file_path===p.original_file_path&&(remaining.state!=='completed'||remaining.retired_at))continue;
      }
      await db.remove('presentation-originals',[p.original_file_path]);
      // Also clean previews produced before the CloudConvert migration.
      const prefix=p.user_id+'/'+p.id+'/',items=await db.json('/storage/v1/object/list/presentation-previews',{method:'POST',body:{prefix,limit:100,offset:0}});
      const names=items.filter(item=>typeof item.name==='string'&&!item.name.includes('/')&&item.name.endsWith('.pdf')).map(item=>prefix+item.name);
      if(names.length)await db.remove('presentation-previews',names);
      if(items.length<100)await db.json('/rest/v1/presentations?id=eq.'+p.id+'&deleted_at=not.is.null',{method:'PATCH',body:{storage_deleted_at:new Date().toISOString()}});
    }
  }
  async function maintain(){
    const started=Date.now();
    await cleanupDeleted();
    const candidates=await db.json('/rest/v1/presentations?select=id&deleted_at=is.null&upload_completed=eq.true&conversion_id=is.null&conversion_status=in.(queued,processing)&order=created_at.asc&limit=5');
    for(const p of candidates){if(Date.now()-started>45000)break;await advance(p.id);}
    const caches=await db.json('/rest/v1/presentation_conversion_cache?select=id&poll_after=lte.'+encodeURIComponent(new Date().toISOString())+'&next_attempt_at=lte.'+encodeURIComponent(new Date().toISOString())+'&or=(state.in.(queued,starting,processing),provider_deleted.eq.false,retired_at.not.is.null)&order=created_at.asc&limit=10');
    for(const cache of caches){if(Date.now()-started>45000)break;await processCache(cache.id,{cleanup:true});}
    return {checked:true};
  }
  return {advance,processCache,usage,retry,webhook,maintain,cleanupDeleted,db,cloud};
}
