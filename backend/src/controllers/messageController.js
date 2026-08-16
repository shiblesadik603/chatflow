import * as messageService from '../services/messageService.js';
import { getIO } from '../sockets/index.js';

export const createMessage = async (req, res, next) => {
  try {
    const { message, created, participantIds } = await messageService.createMessage(
      req.user._id,
      req.params.conversationId,
      req.body
    );

    if (created) {
      // Real-time delivery has to work the same way regardless of which
      // transport created the message - a client sending over REST
      // shouldn't produce a "quieter" message than one sent over the
      // socket's send_message event. Mirrors the same `created` guard
      // used there: an idempotent retry (created: false) was already
      // broadcast the first time and doesn't need a second announcement.
      const io = getIO();
      io.to(message.conversation.toString()).emit('new_message', message);
      // See messageHandlers.js send_message for why this also goes to
      // each participant's personal room, not just the conversation room.
      participantIds.forEach((id) => io.to(id).emit('conversation_activity', { conversationId: message.conversation.toString() }));
    }

    res.status(created ? 201 : 200).json({ success: true, data: { message } });
  } catch (err) {
    next(err);
  }
};

export const listMessages = async (req, res, next) => {
  try {
    const result = await messageService.listMessages(req.user._id, req.params.conversationId, req.query);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

export const updateMessage = async (req, res, next) => {
  try {
    const message = await messageService.editMessage(req.user._id, req.params.id, req.body.content);

    // Only reaches sockets that joined this conversation's room (Phase 8) -
    // same room-scoping new_message already uses.
    getIO().to(message.conversation.toString()).emit('message_edited', message);

    res.status(200).json({ success: true, data: { message } });
  } catch (err) {
    next(err);
  }
};

export const deleteMessage = async (req, res, next) => {
  try {
    const message = await messageService.deleteMessage(req.user._id, req.params.id);

    // A minimal payload, not the full message - the client just needs to
    // know which message to remove/mark deleted locally. Content is
    // already cleared server-side either way, so there's nothing to hide
    // by sending less, it's just the right shape for this event.
    getIO().to(message.conversation.toString()).emit('message_deleted', {
      messageId: message._id.toString(),
      conversationId: message.conversation.toString(),
      deletedAt: message.deletedAt,
    });

    res.status(200).json({ success: true, message: 'Message deleted' });
  } catch (err) {
    next(err);
  }
};
