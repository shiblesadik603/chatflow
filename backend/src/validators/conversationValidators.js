import { z } from 'zod';
import { objectIdString } from './common.js';

export const createConversationSchema = z.object({
  participantId: objectIdString,
});
