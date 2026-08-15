import { z } from 'zod';
import { objectIdString } from './common.js';

const attachmentSchema = z.object({
  url: z.string().url(),
  fileName: z.string().optional(),
  mimeType: z.string().optional(),
  size: z.number().positive().optional(),
  duration: z.number().positive().optional(),
});

// 'system' is deliberately excluded - those are created internally
// (e.g. group membership changes in Phase 13), never by a client request.
export const createMessageSchema = z
  .object({
    messageType: z.enum(['text', 'image', 'file', 'voice']).default('text'),
    content: z.string().trim().max(5000).optional(),
    attachments: z.array(attachmentSchema).optional(),
    // Client-generated id for the idempotency check - see messageService.js.
    clientMessageId: z.string().min(1).max(100).optional(),
  })
  .refine((data) => data.messageType !== 'text' || !!data.content, {
    message: 'Text messages require content',
  })
  .refine((data) => data.messageType === 'text' || (data.attachments?.length ?? 0) > 0, {
    message: 'Image, file, and voice messages require at least one attachment',
  });

export const updateMessageSchema = z.object({
  content: z.string().trim().min(1, 'Content is required').max(5000),
});

export const listMessagesQuerySchema = z.object({
  before: objectIdString.optional(),
  limit: z.coerce.number().int().positive().max(100).default(30),
});
