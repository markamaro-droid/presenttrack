import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {ChatError} from './ai-access.mjs';
import {createLearningStore,uuid} from './learning-store.mjs';
import {prepareUnderstanding} from './presentation-understanding.mjs';
import {assessExplanation} from './learning-analysis.mjs';
import {deleteLearningAccount} from './learning-account.mjs';
import '../assets/evaluation/study-habits.js';
export const baselineUnderstanding=()=>({topic:globalThis.PT_EVALUATION_DECK.title,objectives:[{text:'Explain healthy study habits and why they help students learn.',source:'stated'}],slides:globalThis.PT_EVALUATION_DECK.slides.map((s,i)=>({number:i+1,title:s.title,mainPoints:s.bullets,terminology:[],examples:[]})),limitations:[]});
export function createLearningService({env=process.env,fetchImpl=fetch,store=createLearningStore({env,fetchImpl})}={}){
  return async(authorization,input)=>{
    const {userId:user}=await store.authenticate(authorization);
    if(!input||typeof input.action!=='string')throw new ChatError(400,'invalid_request','Choose a valid learning action.');
    const id=input.id;if(id!==undefined&&!uuid.test(id))throw new ChatError(400,'invalid_id','Invalid record identifier.');
    if(input.action==='delete-account')return deleteLearningAccount(user,authorization,input,{env,fetchImpl});
    if(input.action==='history')return {sessions:await store.history(user),deleted:await store.list('learning_deletions',user,'&select=id,legacy_key')};
    if(input.action==='prepare'){const {source,...presentation}=await prepareUnderstanding(store,user,id,{env,fetchImpl});return {presentation}}
    if(input.action==='understanding'){await store.presentation(user,id);return {presentation:(await store.list('presentation_understanding',user,'&presentation_id=eq.'+id))[0]||null}}
    if(input.action==='review'){
      const session=await store.session(user,id);if(!session)throw new ChatError(404,'not_found','Practice result not found.');
      if(session.result.explanationQuality?.status==='completed')return {session};
      if(!await store.rpc('take_learning_slot',{p_user:user,p_kind:'explanation'}))throw new ChatError(429,'learning_limit','Explanation-review allowance reached. Retry later.');
      const understanding=session.kind==='baseline'||session.kind==='reassessment'?baselineUnderstanding():(await store.list('presentation_understanding',user,'&presentation_id=eq.'+session.presentation_id))[0]?.analysis;
      if(!understanding)throw new ChatError(409,'content_pending','Prepare the presentation content before reviewing its explanation.');
      const explanation=await assessExplanation({env,fetchImpl,understanding,transcript:session.result.transcript,alignment:session.result.slideAlignment});
      return {session:(await store.patch('learning_sessions',user,'&id=eq.'+id,{result:{...session.result,explanationQuality:explanation}}))[0]};
    }
    if(input.action==='delete-session'){
      const session=await store.session(user,id);if(!session||session.kind==='baseline')throw new ChatError(400,'baseline_preserved','The original baseline is retained. Other practice sessions can be deleted.');
      await store.rpc('delete_learning_session',{p_user:user,p_id:id});return {deleted:true};
    }
    if(input.action==='memory'){
      const preferences=await store.preferences(user);
      await store.remove('tracy_conversations',user,'&expires_at=lte.'+encodeURIComponent(new Date().toISOString()));
      return {preferences,memories:await store.list('tracy_memories',user,'&order=created_at.desc'),conversations:await store.list('tracy_conversations',user,'&order=created_at.desc&limit=50')};
    }
    if(input.action==='preferences'){
      const schema=z.object({conversation_history:z.boolean(),retention_days:z.union([z.literal(30),z.literal(90),z.literal(365)]),pause_threshold:z.number().min(1).max(5),coaching_style:z.string().trim().min(1).max(200)}).strict();
      const parsed=schema.safeParse(input.preferences);if(!parsed.success)throw new ChatError(400,'invalid_preferences','Check the memory and pause settings.');
      await store.rpc('set_learning_preferences',{p_user:user,p_preferences:parsed.data});
      return {preferences:parsed.data};
    }
    if(input.action==='save-memory'){
      if(input.approved!==true||typeof input.content!=='string'||!input.content.trim()||input.content.length>500)throw new ChatError(400,'invalid_memory','Approve a memory of 1–500 characters.');
      const memories=await store.list('tracy_memories',user,'&select=id');if(!id&&memories.length>=50)throw new ChatError(400,'memory_limit','Keep up to 50 useful memories. Edit or delete one first.');
      return {memory:id?(await store.patch('tracy_memories',user,'&id=eq.'+id,{content:input.content.trim()}))[0]:(await store.insert('tracy_memories',{id:randomUUID(),user_id:user,content:input.content.trim(),source:'user-approved'}))[0]};
    }
    if(input.action==='delete-memory'){if(!id)throw new ChatError(400,'invalid_id','Select a memory.');await store.remove('tracy_memories',user,'&id=eq.'+id);return {deleted:true}}
    if(input.action==='clear-conversations'){await store.remove('tracy_conversations',user);return {deleted:true}}
    throw new ChatError(400,'invalid_action','Unknown learning action.');
  };
}
