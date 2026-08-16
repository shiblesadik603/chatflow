import { z } from 'zod';

export const uploadTypeSchema = z
  .object({
    type: z.enum(['image', 'document', 'voice']).default('image'),
    // The browser's MediaRecorder already knows exactly how long a
    // recording ran (it can track elapsed time itself) - trusting that
    // client-reported value is simpler and more reliable than parsing it
    // back out of the audio container server-side, which is genuinely
    // unreliable for MediaRecorder's streamed WebM/Opus output
    // specifically. Sanity-bounded rather than trusted blindly: positive,
    // capped at 10 minutes.
    duration: z.coerce.number().positive().max(600, 'Voice messages are limited to 10 minutes').optional(),
  })
  .refine((data) => data.type !== 'voice' || data.duration !== undefined, {
    message: 'Voice messages require a duration',
  });
