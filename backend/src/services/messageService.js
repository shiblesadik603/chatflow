import { Conversation } from '../models/Conversation.js';
import { Message } from '../models/Message.js';
import { AppError } from '../utils/AppError.js';
import { assertParticipant } from './conversationService.js';
import { areBlocked } from './userService.js';

const SENDER_FIELDS = 'name avatar';

export const createMessage = async (userId, conversationId, payload) => {
  const conversation = await assertParticipant(userId, conversationId);

  if (conversation.type === 'private') {
    const otherUserId = conversation.participants.find((p) => p.toString() !== userId.toString());
    if (otherUserId && (await areBlocked(userId, otherUserId))) {
      throw new AppError('You cannot message this user', 403, 'BLOCKED');
    }
  }

  const { clientMessageId } = payload;

  try {
    const created = await Message.create({
      conversation: conversationId,
      sender: userId,
      content: payload.content || '',
      messageType: payload.messageType,
      attachments: payload.attachments || [],
      clientMessageId,
    });

    // Keeps the conversation list (Phase 5) sorted by recent activity -
    // updatedAt bumps automatically because the schema has timestamps: true.
    await Conversation.findByIdAndUpdate(conversationId, { lastMessage: created._id });

    const message = await Message.findById(created._id).populate('sender', SENDER_FIELDS);
    return { message, created: true };
  } catch (err) {
    if (err.code === 11000 && clientMessageId) {
      // Same idempotency pattern as conversation creation (Phase 5): a
      // duplicate key here means this exact clientMessageId already
      // produced a message - most likely a network retry of a request
      // whose response never reached the client. Return what's already
      // there instead of creating (or erroring on) a duplicate.
      const existing = await Message.findOne({
        conversation: conversationId,
        sender: userId,
        clientMessageId,
      }).populate('sender', SENDER_FIELDS);
      return { message: existing, created: false };
    }
    throw err;
  }
};

export const listMessages = async (userId, conversationId, { before, limit }) => {
  await assertParticipant(userId, conversationId);

  const query = { conversation: conversationId };
  if (before) {
    query._id = { $lt: before };
  }

  // Fetch one extra document - if we get limit+1 back, there's another
  // page, and we drop the extra one before returning. Avoids a separate
  // count query just to know whether "load more" should show up.
  const docs = await Message.find(query)
    .sort({ _id: -1 })
    .limit(limit + 1)
    .populate('sender', SENDER_FIELDS);

  const hasMore = docs.length > limit;
  const page = docs.slice(0, limit).reverse(); // oldest -> newest for direct rendering

  return {
    messages: page,
    nextCursor: hasMore ? page[0]._id : null,
    hasMore,
  };
};

const assertOwner = async (userId, messageId) => {
  const message = await Message.findById(messageId);
  if (!message) {
    throw new AppError('Message not found', 404, 'MESSAGE_NOT_FOUND');
  }
  if (message.sender.toString() !== userId.toString()) {
    throw new AppError('You can only modify your own messages', 403, 'NOT_MESSAGE_OWNER');
  }
  return message;
};

export const editMessage = async (userId, messageId, content) => {
  const message = await assertOwner(userId, messageId);

  if (message.isDeleted) {
    throw new AppError('Cannot edit a deleted message', 400, 'MESSAGE_DELETED');
  }
  if (message.messageType !== 'text') {
    throw new AppError('Only text messages can be edited', 400, 'NOT_EDITABLE');
  }

  message.content = content;
  message.isEdited = true;
  message.editedAt = new Date();
  await message.save();
  await message.populate('sender', SENDER_FIELDS);

  // Broadcasting `message_edited` over Socket.IO happens in Phase 12, once
  // real-time infrastructure exists (Phases 7-11).
  return message;
};

export const deleteMessage = async (userId, messageId) => {
  const message = await assertOwner(userId, messageId);

  if (message.isDeleted) {
    throw new AppError('Message is already deleted', 409, 'ALREADY_DELETED');
  }

  message.isDeleted = true;
  message.deletedAt = new Date();
  message.content = '';
  message.attachments = [];
  await message.save();

  // Broadcasting `message_deleted` over Socket.IO happens in Phase 12.
  return message;
};
