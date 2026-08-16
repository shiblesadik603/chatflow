import { z } from 'zod';

export const uploadTypeSchema = z.object({
  type: z.enum(['image', 'document']).default('image'),
});
