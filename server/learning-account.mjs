import {ChatError} from './ai-access.mjs';
export async function deleteLearningAccount(user,authorization,input,{env,fetchImpl}){
  if(input.confirmation!=='DELETE'||typeof input.password!=='string'||input.password.length<1||input.password.length>200)throw new ChatError(400,'confirm_deletion','Type DELETE and enter your current password to delete your account.');
  const base=env.SUPABASE_URL.replace(/\/$/,''),key=env.SUPABASE_SERVICE_ROLE_KEY;
  const me=await fetchImpl(base+'/auth/v1/user',{headers:{apikey:env.SUPABASE_ANON_KEY,Authorization:authorization},signal:AbortSignal.timeout(8000)});
  const profile=me.ok?await me.json():null;
  if(profile?.id!==user||!profile.email)throw new ChatError(401,'unauthorized','Sign in again before deleting your account.');
  const check=await fetchImpl(base+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:env.SUPABASE_ANON_KEY,'Content-Type':'application/json'},body:JSON.stringify({email:profile.email,password:input.password}),signal:AbortSignal.timeout(10000)});
  const verified=check.ok?await check.json():null;
  if(verified?.user?.id!==user)throw new ChatError(403,'password_required','The password could not be verified. Reset your password first if needed.');
  const headers={apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'};
  // Only this account's known private storage prefixes. Clear before Auth deletion,
  // since Supabase prevents deleting owners who still have storage objects.
  for(const bucket of ['presentation-originals','presentation-previews','presentations','practice-audio-temp','tracy-speech-cache']){
    const folders=[user];let operations=0;
    while(folders.length){const prefix=folders.pop();if(++operations>300)throw new ChatError(503,'deletion_pending','File cleanup needs another pass. Retry deletion to continue.');
      const listing=await fetchImpl(base+'/storage/v1/object/list/'+bucket,{method:'POST',headers,body:JSON.stringify({prefix,limit:100,offset:0,sortBy:{column:'name',order:'asc'}}),signal:AbortSignal.timeout(10000)});
      if(!listing.ok){const error=await listing.json().catch(()=>({}));if(error.message==='Bucket not found'||error.code==='NoSuchBucket')break;throw new ChatError(503,'deletion_pending','Private file cleanup is unavailable. Your account has not been deleted.');}
      const entries=await listing.json(),files=[];for(const entry of entries){if(typeof entry.name!=='string'||entry.name.includes('/')||entry.name==='..')throw new ChatError(503,'deletion_pending','Unexpected private storage path.');const name=prefix+'/'+entry.name;if(entry.id)files.push(name);else folders.push(name)}
      if(files.length){const deleted=await fetchImpl(base+'/storage/v1/object/'+bucket,{method:'DELETE',headers,body:JSON.stringify({prefixes:files}),signal:AbortSignal.timeout(10000)});if(!deleted.ok)throw new ChatError(503,'deletion_pending','Some private files could not be deleted. Retry to continue.');}
      if(entries.length===100)folders.unshift(prefix);
    }
  }
  const response=await fetchImpl(base+'/auth/v1/admin/users/'+encodeURIComponent(user),{method:'DELETE',headers,signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw new ChatError(503,'deletion_pending','Account deletion could not finish. Retry to continue.');
  return {deleted:true};
}
