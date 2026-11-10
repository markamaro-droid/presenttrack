// Read-only report projection: cards and delivery feedback share saved measurements.
import { classify } from './classify.js';
import { ruleBasedFeedback } from './feedback.js';
import { CRITERIA } from './criteria.js';

export function topicFeedback(content) {
  if (content?.topicStatus === 'limited_coverage') return 'Your recognized speech had limited overlap with the slide topic or covered only part of the presentation. Connect each main point to the slides. Paraphrasing and recognition errors can affect this check. Your score measures delivery, not topic relevance.';
  if (content?.topicStatus === 'related') return 'Your recognized speech includes vocabulary related to the slide topic. This does not verify factual accuracy. Your score measures delivery, not topic relevance.';
  return '';
}

export function withTopicFeedback(feedback, content) {
  const note = topicFeedback(content);
  if (!note) return feedback;
  return { ...feedback, summary: `${feedback.summary} ${note}`,
    ...(content.topicStatus === 'limited_coverage' ? {
      improvements: [note, ...feedback.improvements].slice(0, 5),
      recommendations: ['Relate each slide to your main message and explain the sections you have not covered yet.', ...feedback.recommendations].slice(0, 5)
    } : {}) };
}

// Content comments are separate from measured delivery. Discard conflicting delivery
// observations from older/model-generated comments instead of inventing matching counts.
export function contentOnlyComments(comments) {
  if (!comments) return null;
  const delivery = /\b(?:fillers?|hesitations?|pauses?|wpm|words per minute|speaking (?:pace|speed)|um+|uh+|erm|hmm)\b/i;
  return { ...comments, summary: delivery.test(comments.summary || '') ? 'Review the slide-content suggestions below. Delivery measurements are shown separately.' : comments.summary,
    ...Object.fromEntries(['strengths','improvements','recommendations'].map(key => [key, (comments[key] || []).filter(text => !delivery.test(text))])) };
}

export function measuredReport(saved) {
  if (!saved) return null;
  const metrics = saved.metrics || {};
  const result = classify(metrics, saved.quality, saved.criteria || CRITERIA);
  const feedback = withTopicFeedback(ruleBasedFeedback(metrics, result), saved.source === 'recorded-evaluation' ? saved.contentValidation : null);
  if (saved.source !== 'recorded-evaluation' && saved.criteria?.duration) {
    const { targetMinSec, targetMaxSec } = saved.criteria.duration;
    const target = `${Math.round(targetMinSec)}–${Math.round(targetMaxSec)} second`;
    for (const key of ['strengths', 'improvements', 'recommendations']) {
      feedback[key] = feedback[key].map(s => s.replace(/2-3 minute/g, target));
    }
  }
  // Preserve historical scoring; refresh wording only, without saving or re-transcribing.
  return { ...saved, feedback, comments: contentOnlyComments(saved.comments), dims: Object.fromEntries(Object.entries(saved.dims || {}).map(([key, dim]) =>
    [key, { ...dim, ...(result.dims[key] ? { label: result.dims[key].label, detail: result.dims[key].detail } : {}) }])) };
}

export function fillerDetails(metrics = {}) {
  if (!Number.isFinite(metrics.fillerCount)) return 'Filler measurement unavailable.';
  const counts = new Map();
  for (const event of metrics.fillers || []) {
    if (typeof event.word === 'string' && event.word.trim()) counts.set(event.word, (counts.get(event.word) || 0) + 1);
  }
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  if (total && total !== metrics.fillerCount) return 'Saved filler details disagree with the total. Retake to verify this measurement.';
  if (!metrics.fillerCount) return 'No filler words detected; recognition can miss some.';
  if (!total) return 'Word-level filler details were not saved for this attempt.';
  return 'Detected: ' + [...counts].map(([word, count]) => `${word} × ${count}`).join(', ') + '.';
}
