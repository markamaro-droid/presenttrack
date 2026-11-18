import {ChatError,createAccess} from './ai-access.mjs';
export const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function createLearningStore({env=process.env,fetchImpl=fetch}={}){
  const base=env.SUPABASE_URL?.replace(/\/$/,''),key=env.SUPABASE_SERVICE_ROLE_KEY;
  async function request(path,{method='GET',body,prefer='return=representation'}={}){
    if(!base||!key)throw new ChatError(503,'learning_setup','Learning history needs the server database configuration.');
    const response=await fetchImpl(base+'/rest/v1/'+path,{method,headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',Prefer:prefer},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(12000)});
    if(!response.ok)throw new ChatError(503,'learning_storage','Learning history could not be saved or loaded. Apply the learning-system migration and retry.');
    return response.status===204?null:response.json();
  }
  const own=(table,user,suffix='')=>table+'?user_id=eq.'+encodeURIComponent(user)+suffix;
  return {request,own,
    authenticate:createAccess({env,fetchImpl,requiredKey:'SUPABASE_SERVICE_ROLE_KEY'}).authenticate,
    list:(table,user,suffix='')=>request(own(table,user,suffix)),
    insert:(table,body)=>request(table,{method:'POST',body}),
    patch:(table,user,suffix,body)=>request(own(table,user,suffix),{method:'PATCH',body}),
    remove:(table,user,suffix='')=>request(own(table,user,suffix),{method:'DELETE'}),
    rpc:(name,body)=>request('rpc/'+name,{method:'POST',body}),
    async preferences(user){return (await request(own('learning_preferences',user)))[0]||{conversation_history:false,retention_days:30,pause_threshold:2,coaching_style:'Supportive and specific'}},
    async session(user,id){if(!uuid.test(id||''))return null;return (await request(own('learning_sessions',user,'&id=eq.'+id)))[0]||null},
    async presentation(user,id){if(!uuid.test(id||''))throw new ChatError(400,'invalid_presentation','Choose a saved presentation.');const row=(await request(own('presentations',user,'&id=eq.'+id+'&deleted_at=is.null')))[0];if(!row)throw new ChatError(404,'not_found','Presentation not found in your account.');return row},
    async history(user){const result=[];for(let offset=0;;offset+=200){const batch=await request(own('learning_sessions',user,'&order=created_at.asc,id.asc&limit=200&offset='+offset));result.push(...batch);if(batch.length<200)break}return result}
  };
}
