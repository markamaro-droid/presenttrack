import {readLimited} from './presentation-files.mjs';
import {ChatError} from './ai-access.mjs';
export const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function createPresentationStorage({env=process.env,fetchImpl=fetch}={}){
  const base=(env.SUPABASE_URL||'').replace(/\/$/,'');
  const headers=()=>{if(!base||!env.SUPABASE_SERVICE_ROLE_KEY)throw new ChatError(503,'setup_required','Presentation processing needs server setup.');return {apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY};};
  const json=async(route,{method='GET',body,prefer}={})=>{
    const response=await fetchImpl(base+route,{method,redirect:'error',signal:AbortSignal.timeout(12000),headers:{...headers(),'Content-Type':'application/json',...(prefer?{Prefer:prefer}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});
    if(!response.ok)throw new ChatError(503,'storage_unavailable','Presentation storage is unavailable. Check the CloudConvert migration and retry.');
    if(response.status===204)return null;const bytes=await readLimited(response,2_000_000);return bytes.length?JSON.parse(bytes.toString()):null;
  };
  const rpc=(name,args={})=>json('/rest/v1/rpc/'+name,{method:'POST',body:args});
  const encoded=value=>value.split('/').map(encodeURIComponent).join('/');
  return {
    json,rpc,
    presentation:async id=>(await json('/rest/v1/presentations?select=*&id=eq.'+id))[0],
    cache:async id=>(await json('/rest/v1/presentation_conversion_cache?select=*&id=eq.'+id))[0],
    patchPresentation:(id,patch,token)=>json('/rest/v1/presentations?id=eq.'+id+'&deleted_at=is.null'+(token?'&lease_token=eq.'+token:''),{method:'PATCH',body:patch,prefer:'return=representation'}),
    patchCache:async(id,token,patch)=>{
      const rows=await json('/rest/v1/presentation_conversion_cache?id=eq.'+id+'&lock_token=eq.'+token+'&lock_until=gt.'+encodeURIComponent(new Date().toISOString()),{method:'PATCH',body:{...patch,updated_at:new Date().toISOString()},prefer:'return=representation'});
      if(!rows?.[0])throw Error('Conversion lease lost');return rows[0];
    },
    sign:async(bucket,name,seconds=300)=>{
      const data=await json('/storage/v1/object/sign/'+bucket+'/'+encoded(name),{method:'POST',body:{expiresIn:seconds}});
      if(!data?.signedURL?.startsWith('/object/sign/'))throw Error('Invalid signed file response');return base+'/storage/v1'+data.signedURL;
    },
    download:async(bucket,name,limit)=>{
      const response=await fetchImpl(base+'/storage/v1/object/authenticated/'+bucket+'/'+encoded(name),{headers:headers(),redirect:'error',signal:AbortSignal.timeout(25000)});
      return readLimited(response,limit);
    },
    upload:async(name,bytes)=>{
      const response=await fetchImpl(base+'/storage/v1/object/presentation-previews/'+encoded(name),{method:'POST',headers:{...headers(),'Content-Type':'application/pdf','x-upsert':'false'},body:bytes,redirect:'error',signal:AbortSignal.timeout(25000)});
      if(response.ok)return true;
      const error=await response.json().catch(()=>({}));
      if(response.status===409||error.error==='Duplicate'||error.code==='Duplicate'||error.statusCode==='409')return false;
      throw Error('Preview upload failed');
    },
    remove:(bucket,names)=>json('/storage/v1/object/'+bucket,{method:'DELETE',body:{prefixes:names}})
  };
}
