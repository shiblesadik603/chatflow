import { z } from 'zod';
import { AppError } from '../utils/AppError.js';
import { objectIdString } from '../validators/common.js';
import * as messageService from '../services/messageService.js';
import { logger } from '../config/logger.js';

const messageIdSchema = z.object({ messageId: objectIdString });
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
    return safeAck(ack, { success: false, message: err.message, errorCode: err.errorCode });
  }
  logger.error(`Unhandled socket error on ${event}: ${err.stack || err.message}`);
  safeAck(ack, { success: false, message: 'Something went wrong', errorCode: 'INTERNAL_SERVER_ERROR' });
};

export const registerReadReceiptHandlers = (io, socket) => {
  // The client fires this automatically the moment it receives a
  // new_message it wasn't the sender of - not a user action, just "my
  // device got this."
  socket.on('message_delivered', async (payload, ack) => {
    try {
      const { messageId } = messageIdSchema.parse(payload || {});
      const { message, delivered } = await messageService.markDelivered(socket.userId, messageId);

      if (delivered) {
        // Reaches every device the sender has open, via the per-userId
        // room every socket joins on connect (Phase 8).
        io.to(message.sender.toString()).emit('message_delivered', {
          messageId: message._id.toString(),
          conversationId: message.conversation.toString(),
          userId: socket.userId,
          deliveredAt: new Date(),
        });
      }

      safeAck(ack, { success: true, data: { delivered } });
    } catch (err) {
      handleError(err, ack, 'message_delivered');
    }
  });

  // The client fires this when the user opens/focuses a conversation.
  socket.on('message_read', async (payload, ack) => {
    try {
      const { conversationId } = conversationIdSchema.parse(payload || {});
      const { messageIds, bySender } = await messageService.markConversationRead(
        socket.userId,
        conversationId
      );

      // One event per sender, listing every one of their messages that
      // just became read - not one event per message.
      bySender.forEach((ids, senderId) => {
        io.to(senderId).emit('message_read', {
          conversationId,
          messageIds: ids,
          readBy: socket.userId,
          readAt: new Date(),
        });
      });

      safeAck(ack, { success: true, data: { markedCount: messageIds.length } });
    } catch (err) {
      handleError(err, ack, 'message_read');
    }
  });
};
