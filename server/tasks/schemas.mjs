import { z } from 'zod';

const short = z.string().trim().min(1).max(400);
export const analysisSchema = z.object({
  redundancies: z.array(short).max(3),
  unclearSentences: z.array(short).max(3),
  fillerPatterns: z.array(short).max(3),
  adjustments: z.array(z.object({ priority: z.enum(['high', 'medium', 'low']), action: short }).strict()).max(3)
}).strict();
export const proofreadingSchema = z.object({ fixes: z.array(z.object({
  slideId: z.string().max(80), runId: z.string().max(120), original: short, corrected: short,
  reason: short, severity: z.enum(['low', 'medium', 'high'])
}).strict()).max(12) }).strict();
export const layoutSchema = z.object({ flags: z.array(z.object({
  slideId: z.string().max(80), issue: short, severity: z.enum(['low', 'medium', 'high'])
}).strict()).max(8) }).strict();
export const verbatimSchema = z.object({ transcript: z.string().trim().min(1).max(24000) }).strict();
export const wordSchema = z.object({ word: z.string().min(1).max(100), start: z.number().finite().nonnegative(), end: z.number().finite().nonnegative() })
  .refine(w => w.end >= w.start);
export const transcriptionSchema = z.object({ text: z.string().max(24000), words: z.array(wordSchema).max(6000).optional() });
