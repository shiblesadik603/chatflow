import { z } from 'zod';
import { AppError } from '../utils/AppError.js';
import { objectIdString } from '../validators/common.js';
import { createMessageSchema } from '../validators/messageValidators.js';
import * as conversationService from '../services/conversationService.js';
import * as messageService from '../services/messageService.js';
import { logger } from '../config/logger.js';

const conversationIdSchema = z.object({ conversationId: objectIdString });

const safeAck = (ack, payload) => {
  if (typeof ack === 'function') ack(payload);
};

const handleError = (err, ack, event) => {
  if (err instanceof z.ZodError) {
    const details = err.flatten().fieldErrors;
    return safeAck(ack, { success: false, message: 'Validation failed', errorCode: 'VALIDATION_ERROR', details });
  }
  if (err instanceof AppError) {
    logger.warn(`${err.errorCode} on ${event}: ${err.message}`);
    return safeAck(ack, { success: false, message: err.message, errorCode: err.errorCode, details: err.details });
  }
  logger.error(`Unhandled socket error on ${event}: ${err.stack || err.message}`);
  safeAck(ack, { success: false, message: 'Something went wrong', errorCode: 'INTERNAL_SERVER_ERROR' });
};

export const registerMessageHandlers = (io, socket) => {
  socket.on('join_conversation', async (payload, ack) => {
    try {
      const { conversationId } = conversationIdSchema.parse(payload || {});
      // Reuses the exact same participant check the REST API relies on
      // (conversationService.assertParticipant, Phase 5) - a client asking
      // to join a room it isn't part of gets rejected here, not trusted.
      await conversationService.assertParticipant(socket.userId, conversationId);
      socket.join(conversationId);
      safeAck(ack, { success: true });
    } catch (err) {
      handleError(err, ack, 'join_conversation');
    }
  });

  socket.on('leave_conversation', (payload, ack) => {
    try {
      const { conversationId } = conversationIdSchema.parse(payload || {});
      socket.leave(conversationId);
      safeAck(ack, { success: true });
    } catch (err) {
      handleError(err, ack, 'leave_conversation');
    }
  });

  socket.on('send_message', async (payload, ack) => {
    try {
      // Two schemas, not one: createMessageSchema.extend() isn't available
      // because it's a ZodEffects (the result of .refine()), not a plain
      // ZodObject. Validating conversationId separately sidesteps that -
      // Zod's default "strip unknown keys" behavior means the extra
      // conversationId key in the payload is just ignored by the second call.
      const { conversationId } = conversationIdSchema.parse(payload || {});
      const messageInput = createMessageSchema.parse(payload || {});

      // The exact same service function the REST endpoint uses (Phase 6) -
      // participant check, block check, idempotency, and lastMessage
      // update all happen here with zero duplicated logic.
      const { message, created, participantIds } = await messageService.createMessage(
        socket.userId,
        conversationId,
        messageInput
      );

      if (created) {
        // Only broadcast on a genuine new message - a retried send with the
        // same clientMessageId returns the existing message (created:
        // false) and every room member already received it the first time.
        io.to(conversationId).emit('new_message', message);

        // Reaches every device a participant has open, even ones that
        // haven't called join_conversation for this specific conversation
        // (e.g. a brand new chat, or an existing one just not currently
        // open) - conversation list previews/unread badges need this;
        // new_message's room-scoped delivery deliberately doesn't cover it.
        participantIds.forEach((id) => io.to(id).emit('conversation_activity', { conversationId }));
      }

      safeAck(ack, { success: true, data: { message, created } });
    } catch (err) {
      handleError(err, ack, 'send_message');
    }
  });
};
