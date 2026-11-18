/* Authenticated metadata/jobs. Files go directly to private Supabase Storage. */
(() => {
  const bucket='presentation-originals';
  const cloud=()=>window.PTCloud;
  async function request(action,id,extra={},signal) {
    const owner=cloud()?.user?.id;
    if(!cloud()?.enabled||!owner)throw Error('Sign in to upload and convert presentations.');
    const {data,error}=await cloud().client.auth.getSession();
    if(error||data.session?.user?.id!==owner||cloud().user?.id!==owner)throw Error('Your account changed. Please sign in again.');
    const response=await fetch('/api/presentations',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+data.session.access_token},
      body:JSON.stringify({action,...(id?{id}:{}),...extra}),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(55000)]):AbortSignal.timeout(55000)});
    const value=await response.json();
    if(cloud().user?.id!==owner)throw new DOMException('Account changed','AbortError');
    if(!response.ok)throw Object.assign(Error(value.message||'Presentation request failed.'),{code:value.error,status:response.status});
    return value;
  }
  async function upload(file,title,{id=crypto.randomUUID(),onRegistered=()=>{},cloudconvertConsent=false}={}) {
    PTPresentationContent.selectUpload([file]);
    const owner=cloud()?.user?.id,type=/\.pdf$/i.test(file.name)?'pdf':'pptx';
    const bytes=new Uint8Array(await file.slice(0,8).arrayBuffer());
    if(type==='pdf' ? String.fromCharCode(...bytes.slice(0,5))!=='%PDF-' : bytes[0]!==80||bytes[1]!==75)throw Error('The file contents do not match its extension. Choose an original PDF or PPTX.');
    let {presentation}=await request('create',id,{title,filename:file.name,type,size:file.size,cloudconvertConsent:type==='pptx'&&cloudconvertConsent});
    onRegistered(presentation);
    if(!presentation.upload_completed){
      const result=await cloud().client.storage.from(bucket).upload(presentation.original_file_path,file,{upsert:false,contentType:type==='pdf'?'application/pdf':'application/vnd.openxmlformats-officedocument.presentationml.presentation'});
      if(cloud().user?.id!==owner)throw new DOMException('Account changed','AbortError');
      // An immutable object may already exist after a network timeout. Submit
      // verifies the stored size; the server validates its actual structure.
      if(result.error&&!['409','Duplicate'].includes(String(result.error.statusCode||result.error.error)))throw Error('Original upload failed. Retry with the same file.');
    }
    try { presentation=(await request('submit',id)).presentation; }
    catch(error){if(error.name==='AbortError'||error.status&&error.status<500)throw error;presentation={...presentation,submissionPending:true};}
    return presentation;
  }
  function apply(p,row) {p.remoteId=row.id;p.conversion=row;return p;}
  async function status(p,signal){const {presentation}=await request('status',p.remoteId,{},signal);return apply(p,presentation).conversion;}
  async function retry(p,signal){const {presentation}=await request(p.conversion?.upload_completed?'retry':'submit',p.remoteId,{},signal);apply(p,presentation);return presentation;}
  async function file(p,kind='preview',signal) {
    const owner=cloud()?.user?.id,{url,filename}=await request('download',p.remoteId,{kind},signal);
    const response=await fetch(url,{signal:signal?AbortSignal.any([signal,AbortSignal.timeout(60000)]):AbortSignal.timeout(60000)});
    if(!response.ok)throw Error('The private file could not load. Retry to refresh its download link.');
    const blob=await response.blob();
    if(cloud()?.user?.id!==owner)throw new DOMException('Account changed','AbortError');
    return new File([blob],filename,{type:kind==='preview'||p.conversion?.file_type==='pdf'?'application/pdf':'application/vnd.openxmlformats-officedocument.presentationml.presentation'});
  }
  async function download(p) {
    const original=await file(p,'original'),url=URL.createObjectURL(original),a=document.createElement('a');
    a.href=url;a.download=original.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
  }
  async function restore(S) {
    if(!cloud()?.enabled||!cloud().user)return false;
    const owner=cloud().user.id,known=new Set(S.pres.map(p=>p.remoteId).filter(Boolean)),{presentations}=await request('list');
    if(cloud().user?.id!==owner)return false;
    let changed=false;
    const ids=new Set(presentations.map(row=>row.id));
    S.pres=S.pres.filter(p=>{if(p.remoteId&&known.has(p.remoteId)&&!ids.has(p.remoteId)){changed=true;return false}return true});
    for(const row of presentations){
      let p=S.pres.find(item=>item.remoteId===row.id);
      if(!p){p={id:S.nid++,t:row.title,short:row.title,file:{name:row.original_filename,size:row.file_size},created:row.created_at,date:'Not scheduled',time:'',target:600,ready:20,ppt:row.file_type==='pptx',rq:false,sp:true,final:false,left:null};S.pres.push(p);changed=true;}
      apply(p,row);
    }
    return changed;
  }
  function label(row){
    if(!row)return '';if(!row.upload_completed)return 'Upload awaiting confirmation';
    if(row.error_code==='daily_quota')return 'Daily conversion allowance reached. Next check: '+new Date(row.available_at).toLocaleString();
    if(row.error_code==='consent_required')return 'CloudConvert permission needed';
    if(row.error_code==='confirming_job')return 'Confirming conversion request';
    return ({queued:'Preview queued',processing:row.file_type==='pptx'?'Converting with CloudConvert...':'Checking PDF...',completed:'Preview ready',failed:'Preview unavailable'})[row.conversion_status]||'';
  }
  const consent=(p,signal)=>request('submit',p.remoteId,{cloudconvertConsent:true},signal);
  const usage=async()=> (await request('usage')).usage;

  window.PTPresentations={request,upload,apply,status,retry,file,download,restore,label,consent,usage,remove:p=>request('delete',p.remoteId)};
})();
