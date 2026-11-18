import {randomUUID} from 'node:crypto';
import {createLearningStore} from './learning-store.mjs';
const summary=row=>({id:row.id,title:row.title,kind:row.kind,date:row.created_at,deliveryScore:row.result.deliveryScore??row.result.score,metrics:row.result.metrics,explanation:row.result.explanationQuality?.status==='completed'?{score:row.result.explanationQuality.score,summary:row.result.explanationQuality.summary,criteria:row.result.explanationQuality.criteria,goals:row.result.explanationQuality.goals}:null});
export async function memoryContext(user,message,{env,fetchImpl,presentationId}){
  const store=createLearningStore({env,fetchImpl}),preferences=await store.preferences(user);
  await store.remove('tracy_conversations',user,'&expires_at=lte.'+encodeURIComponent(new Date().toISOString()));
  const [recent,baseline,memories,conversations]=await Promise.all([
    store.list('learning_sessions',user,'&order=created_at.desc&limit=5'),store.list('learning_sessions',user,'&kind=eq.baseline&limit=1'),
    store.list('tracy_memories',user,'&order=created_at.desc&limit=50'),preferences.conversation_history?store.list('tracy_conversations',user,'&order=created_at.desc&limit=40'):[]
  ]);
  const tokens=new Set(message.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu)||[]);
  let presentation=null;
  if(presentationId){
    await store.presentation(user,presentationId);
    const saved=(await store.list('presentation_understanding',user,'&presentation_id=eq.'+presentationId))[0];
    if(saved?.status==='completed'){
      const analysis=saved.analysis,rank=s=>[...tokens].filter(w=>JSON.stringify(s).toLowerCase().includes(w)).length;
      presentation={topic:analysis.topic,objectives:analysis.objectives,slides:[...analysis.slides].sort((a,b)=>rank(b)-rank(a)).slice(0,6),totalSlides:analysis.slides.length,limitations:analysis.limitations};
    }
  }
  memories.sort((a,b)=>[...tokens].filter(w=>b.content.toLowerCase().includes(w)).length-[...tokens].filter(w=>a.content.toLowerCase().includes(w)).length);
  const relevant=conversations.map(c=>({...c,rank:[...tokens].filter(w=>(c.question+' '+c.answer).toLowerCase().includes(w)).length})).filter(c=>c.rank>0).sort((a,b)=>b.rank-a.rank).slice(0,3).map(c=>({question:c.question,answer:c.answer.slice(0,1000),date:c.created_at}));
  // Compact summaries only: never send raw historical transcripts or whole conversations.
  const performance=recent.map(summary).map(r=>({...r,metrics:{wpm:r.metrics?.wpm,words:r.metrics?.words,fillersPer100Words:r.metrics?.fillersPer100Words,pausesPerMinute:r.metrics?.pausesPerMinute,duration:r.metrics?.totalDurationSec},explanation:r.explanation?{score:r.explanation.score,summary:r.explanation.summary,goals:r.explanation.goals}:null}));
  return {preferences,context:{presentation,baseline:baseline[0]?{title:baseline[0].title,date:baseline[0].created_at,metrics:performance.find(p=>p.id===baseline[0].id)?.metrics||{wpm:baseline[0].result.metrics?.wpm,words:baseline[0].result.metrics?.words,fillersPer100Words:baseline[0].result.metrics?.fillersPer100Words}}:null,recentPerformance:performance,approvedMemories:memories.slice(0,8).map(m=>({content:m.content,source:m.source})),priorConversations:relevant,coachingStyle:preferences.coaching_style}};
}
export async function rememberConversation(user,question,answer,preferences,{env,fetchImpl}){
  if(!preferences.conversation_history)return 'disabled';
  const store=createLearningStore({env,fetchImpl});
  // Recheck consent after generation, in case history was disabled during the request.
  const current=await store.preferences(user);if(!current.conversation_history)return 'disabled';
  const saved=await store.rpc('save_tracy_conversation',{p_user:user,p_id:randomUUID(),p_question:question.slice(0,2000),p_answer:answer.slice(0,6000)});
  return saved?'saved':'disabled';
}
