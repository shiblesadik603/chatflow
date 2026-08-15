import * as messageService from '../services/messageService.js';
import { getIO } from '../sockets/index.js';

export const createMessage = async (req, res, next) => {
  try {
    const { message, created } = await messageService.createMessage(
      req.user._id,
      req.params.conversationId,
      req.body
    );
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
