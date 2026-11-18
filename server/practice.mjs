import { createAccess, ChatError } from './ai-access.mjs';
import { computeMetrics } from '../supabase/functions/_shared/metrics.js';
import { classify } from '../supabase/functions/_shared/classify.js';
import { ruleBasedFeedback } from '../supabase/functions/_shared/feedback.js';
import { assessQuality } from '../supabase/functions/_shared/quality.js';
import { CRITERIA } from '../supabase/functions/_shared/criteria.js';
import { presentationFeedback } from './presentation-feedback.mjs';
import { validateContent, contentMessage } from './content-validation.mjs';
import { transcribeVerbatim } from './verbatim.mjs';
import { withTopicFeedback } from '../supabase/functions/_shared/report.js';
import {createLearningStore,uuid} from './learning-store.mjs';
import {assessExplanation,alignTranscript} from './learning-analysis.mjs';
import {baselineUnderstanding} from './learning.mjs';
import '../assets/evaluation/study-habits.js';
const EVALUATION_DECK = globalThis.PT_EVALUATION_DECK;

export function createPracticeService({ env = process.env, fetchImpl = fetch, access = createAccess({ env, fetchImpl, requiredKey: 'GROQ_API_KEY' }) } = {}) {
  return async (authorization, input) => {
    const identity = await access.authenticate(authorization);
    if (input?.purpose !== undefined && input.purpose !== 'evaluation') throw new ChatError(400, 'invalid_purpose', 'Invalid recording purpose.');
    const evaluation = input?.purpose === 'evaluation';
    const durable=input?.sessionId!==undefined,store=durable?createLearningStore({env,fetchImpl}):null;
    let understanding,preferences,ownedPresentation;
    if(durable){
      if(!uuid.test(input.sessionId))throw new ChatError(400,'invalid_session','Invalid practice session identifier.');
      const saved=await store.session(identity.userId,input.sessionId);if(saved)return {...saved.result,sessionId:saved.id,sessionKind:saved.kind,persisted:true};
      preferences=await store.preferences(identity.userId);
      if(evaluation)understanding=baselineUnderstanding();
      else if(input.presentationId){
        ownedPresentation=await store.presentation(identity.userId,input.presentationId);
        const content=(await store.list('presentation_understanding',identity.userId,'&presentation_id=eq.'+input.presentationId))[0];
        if(content?.status!=='completed')throw new ChatError(409,'content_pending','Prepare this presentation’s content before recording.');
        understanding=content.analysis;
      }
    }
    if (evaluation && !env.GEMINI_API_KEY?.trim()) throw new ChatError(503, 'setup_required', 'Recorded evaluation needs a Gemini API key for the verbatim filler check. Ask the site owner to configure it; no score was awarded.');
    const context=understanding?{title:understanding.topic,text:understanding.slides.map(s=>s.title+' '+s.mainPoints.join(' ')).join('\n').slice(0,20000)}:input?.presentation;
    if(context!==undefined&&(!context||typeof context.title!=='string'||context.title.length>160||typeof context.text!=='string'||context.text.length>20000))throw new ChatError(400,'invalid_presentation','Presentation text exceeds the context limit.');
    const stored = typeof input?.storagePath === 'string';
    const validSource = stored
      ? input.audio === undefined && input.storagePath.startsWith(identity.userId + '/') && /^[0-9a-f-]+\/[0-9a-f-]+$/.test(input.storagePath)
      : typeof input?.audio === 'string' && input.audio.length <= 4000000 && /^[A-Za-z0-9+/]+={0,2}$/.test(input.audio);
    if (input?.consent !== true || !validSource
      || !['audio/webm','audio/mp4','audio/mpeg','audio/wav','audio/ogg','video/mp4','video/webm'].includes(input.mime)
      || !Number.isFinite(input.target) || input.target < 60 || input.target > 14400) throw new ChatError(400, 'invalid_recording', 'Choose a supported recording and a valid target time.');
    const storageUrl = stored ? `${env.SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/practice-audio-temp/${input.storagePath}` : null;
    try {
    await access.quota(identity, 'practice');
    let audio;
    if (stored) {
      const download = await fetchImpl(storageUrl, { headers: identity.headers, signal: AbortSignal.timeout(30000) });
      if (!download.ok) throw new ChatError(400, 'upload_unavailable', 'Temporary recording unavailable. Please upload it again.');
      if (Number(download.headers.get('content-length')) > 25000000) { await download.body?.cancel(); throw new ChatError(413, 'too_large', 'Use a recording up to 25 MB.'); }
      const chunks = []; let size = 0;
      for await (const chunk of download.body) {
        size += chunk.length;
        if (size > 25000000) throw new ChatError(413, 'too_large', 'Use a recording up to 25 MB.');
        chunks.push(Buffer.from(chunk));
      }
      audio = Buffer.concat(chunks);
    } else audio = Buffer.from(input.audio, 'base64');
    if (!audio.length || audio.length > (stored ? 25000000 : 3000000)) throw new ChatError(413, 'too_large', 'Recording exceeds the upload limit.');
    const form = new FormData();
    const ext = { 'audio/webm':'webm','audio/mp4':'m4a','audio/mpeg':'mp3','audio/wav':'wav','audio/ogg':'ogg','video/mp4':'mp4','video/webm':'webm' }[input.mime];
    form.set('file', new Blob([audio], { type: input.mime }), 'practice.' + ext);
    form.set('model', env.GROQ_TRANSCRIPTION_MODEL || 'whisper-large-v3');
    form.set('response_format', 'verbose_json');
    form.set('temperature', '0');
    form.set('prompt', 'Verbatim speech with audible hesitations, filler sounds, repetitions and false starts preserved. Do not clean up speech or add words that were not heard.');
    form.append('timestamp_granularities[]', 'word'); form.append('timestamp_granularities[]', 'segment');
    const response = await fetchImpl('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST', headers: { Authorization: `Bearer ${env.GROQ_API_KEY}` }, body: form, signal: AbortSignal.timeout(45000)
    });
    if (!response.ok) throw new ChatError(503, 'transcription_failed', 'Recording analysis is unavailable or its usage limit was reached. Retry later; no report was generated.');
    const data = await response.json();
    if (!Number.isFinite(data.duration) || data.duration < 20 || data.duration > 600 || !Array.isArray(data.words) || !data.words.length || data.words.length > 10000
      || data.words.some(w => typeof w.word !== 'string' || !Number.isFinite(w.start) || !Number.isFinite(w.end) || w.start < 0 || w.end < w.start || w.end > data.duration + 1)) throw new ChatError(422, 'unusable_recording', 'Use a clear recording between 20 seconds and 10 minutes with audible speech.');
    const transcript = data.words.map(w => w.word).join(' ').trim().slice(0,20000);
    const reference = evaluation ? EVALUATION_DECK.slides.flatMap(s => s.bullets).join(' ') : context?.text || '';
    const contentValidation = validateContent(transcript, { reference, durationSec: data.duration, evaluation,
      sections: evaluation ? EVALUATION_DECK.slides.map(s => s.bullets.join(' ')) : [] });
    if (!contentValidation.eligible) throw new ChatError(422, 'invalid_presentation_speech', contentMessage(contentValidation.reason));
    let verbatim = null, verbatimFailed = false;
    try { verbatim = await transcribeVerbatim({ env, fetchImpl, audio, mime: input.mime, transcript }); } catch { verbatimFailed = true; }
    if (evaluation && !verbatim) throw new ChatError(503, 'filler_check_unavailable', 'The verbatim filler check could not finish. No baseline was awarded. Retry analysis to use the same recording.');
    if (evaluation) {
      const checked = validateContent(verbatim, { reference, durationSec: data.duration, evaluation: true, sections: EVALUATION_DECK.slides.map(s => s.bullets.join(' ')) });
      if (!checked.eligible) throw new ChatError(422, 'invalid_presentation_speech', contentMessage(checked.reason));
      if (checked.topicStatus === 'limited_coverage') contentValidation.topicStatus = 'limited_coverage';
    }
    const pauseThreshold=preferences?.pause_threshold||2;
    const metrics = computeMetrics({ words: data.words, totalDurationSec: data.duration, ...(verbatim ? { fillerTranscript: verbatim } : {}) },{...CRITERIA,pauses:{...CRITERIA.pauses,longPauseSec:pauseThreshold}});
    metrics.wpm = metrics.overallWpm;
    metrics.paceBasis = 'recognized-words-over-audio-duration';
    metrics.pauseBasis = 'audio-word-timestamps';
    metrics.fillerBasis = verbatim ? 'verbatim-audio-transcript' : 'audio-word-transcript';
    metrics.fillersPer100Words=metrics.words?Math.round(metrics.fillerCount/metrics.words*1000)/10:0;
    metrics.pausesPerMinute=metrics.pauseCount/(data.duration/60);
    metrics.pauseThreshold=pauseThreshold;
    metrics.paceWindows=Array.from({length:Math.ceil(data.duration/30)},(_,i)=>({start:i*30,end:Math.min(data.duration,(i+1)*30),wpm:Math.round(data.words.filter(w=>w.start>=i*30&&w.start<(i+1)*30).length/Math.max(1,Math.min(30,data.duration-i*30))*60)}));
    const quality = assessQuality(metrics, Array.isArray(data.segments) ? data.segments : []);
    if (quality.level === 'unusable') throw new ChatError(422, 'unusable_recording', 'Not enough clear speech was detected. Try recording again in a quiet place.');
    quality.warnings.push(verbatim ? 'Fillers are estimated from a separate verbatim audio transcription. Their exact timeline positions are unavailable.' : 'Filler counts are a lower-bound estimate from the audio transcript; speech recognition can omit hesitations. Zero detected does not prove there were none.');
    if (verbatimFailed) quality.warnings.push('The additional verbatim speech check was unavailable. No extra filler events were invented.');
    const criteria = evaluation ? CRITERIA : { ...CRITERIA, duration: { ...CRITERIA.duration, targetMinSec: input.target * .9, targetMaxSec: input.target * 1.1, acceptableMinSec: input.target * .75, acceptableMaxSec: input.target * 1.25 } };
    const result = classify(metrics, quality, criteria);
    if(durable){
      // Timings cannot reveal rhetorical intent. Pauses remain observations,
      // rather than an automatic deduction from the new delivery rubric.
      const scored=['pace','fillers','duration'];result.totalPoints=scored.reduce((n,k)=>n+result.dims[k].points,0);result.maxPoints=6;
      result.score=Math.round(result.totalPoints/6*100);result.criteriaVersion='delivery-v2';
      result.classification=result.totalPoints>=5&&scored.every(k=>result.dims[k].points>0)?'proficient':result.totalPoints>=3?'developing':'needs_improvement';
      result.dims.pauses={...result.dims.pauses,scored:false,label:'Pause observations',detail:'Detected gaps are not automatically classified as disruptive. Intentional pauses are not penalized.'};
    }
    const feedback = withTopicFeedback(ruleBasedFeedback(metrics, result), !durable&&evaluation ? contentValidation : null);
    if(durable){for(const key of ['strengths','improvements','recommendations'])feedback[key]=feedback[key].filter(t=>!/pause/i.test(t));feedback.recommendations.push('Review long gaps in context: use pauses intentionally to separate ideas.');}
    // Shared baseline feedback assumes a 2–3 minute task; use the selected practice target instead.
    if (!evaluation) for (const key of ['strengths','improvements','recommendations']) feedback[key] = feedback[key].map(t => t.replace(/2-3 minute/g, `${Math.round(input.target / 60)} minute`));
    const persist=async report=>{
      if(!durable)return report;
      const alignment=understanding?alignTranscript(data.words,input.slideNavigation,data.duration,understanding.slides.length):{segments:[],basis:'unavailable'};
      let explanation={status:'unavailable',score:null,limitations:['No saved presentation content was available for this delivery-only session.']};
      if(understanding){
        try{explanation=await assessExplanation({env,fetchImpl,understanding,transcript,alignment})}
        catch(error){if(evaluation)throw error;explanation={status:'failed',score:null,message:'Explanation analysis could not finish. Delivery results are saved. Retry explanation analysis from this report.'}}
      }
      const completed={...report,created_at:new Date().toISOString(),deliveryScore:report.score,explanationQuality:explanation,slideAlignment:alignment,words:data.words,title:evaluation?EVALUATION_DECK.title:ownedPresentation?.title||context?.title||'Speaking practice',target:input.target};
      const saved=await store.rpc('save_learning_session',{p_user:identity.userId,p_id:input.sessionId,p_presentation:ownedPresentation?.id||null,p_title:completed.title,p_evaluation:evaluation,p_result:completed});
      return {...saved.result,sessionId:saved.id,sessionKind:saved.kind,persisted:true};
    };
    if (evaluation) return persist({ ...result, version: 3, source: 'recorded-evaluation', provider: 'groq', metrics, quality, feedback, criteria, contentValidation,
      topic: EVALUATION_DECK.title, deckId: EVALUATION_DECK.id, deckVersion: EVALUATION_DECK.version,
      transcript, ...(verbatim ? { verbatimTranscript: verbatim } : {}), created_at: new Date().toISOString() });
    let comments=null,contextStatus=context?.text.trim()?'unavailable':'not-provided';
    if(!durable&&context?.text.trim()) {
      try {
        // The recording-analysis slot covers transcription and slide feedback.
        comments=await presentationFeedback({env,fetchImpl,context,transcript,metrics,feedback});
        contextStatus='reviewed';
      } catch { /* Preserve measured results when AI feedback is unavailable. */ }
    }
    return persist({ ...result, metrics, quality, feedback, comments, contextStatus, contentValidation, criteria, provider: 'groq', source: 'recorded-audio', transcript });
    } finally {
      if (stored) {
        try {
          const removed = await fetchImpl(`${env.SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/practice-audio-temp`, {
            method: 'DELETE', headers: { ...identity.headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ prefixes: [input.storagePath] }), signal: AbortSignal.timeout(8000)
          });
          if (!removed.ok) console.warn('Temporary practice audio cleanup failed.');
        } catch { console.warn('Temporary practice audio cleanup unavailable.'); }
      }
    }
  };
}
