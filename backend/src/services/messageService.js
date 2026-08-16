import { Conversation } from '../models/Conversation.js';
import { Message } from '../models/Message.js';
import { AppError } from '../utils/AppError.js';
import { assertParticipant } from './conversationService.js';
import { areBlocked } from './userService.js';

const SENDER_FIELDS = 'name avatar';

// Used internally by groupService for membership/rename announcements -
// never called directly by a client request, so no participant/block
// checks: the caller (groupService) has already established the actor is
// allowed to be doing this. `content` deliberately doesn't repeat the
// actor's name - the message's populated `sender` field already carries
// that, and the frontend renders system messages as "{sender.name} {content}".
export const createSystemMessage = async (conversationId, actorUserId, content) => {
  const created = await Message.create({
    conversation: conversationId,
    sender: actorUserId,
    content,
    messageType: 'system',
  });
  await Conversation.findByIdAndUpdate(conversationId, { lastMessage: created._id });
  return Message.findById(created._id).populate('sender', SENDER_FIELDS);
};

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
    // Returned alongside the message (not re-fetched by callers) since
    // assertParticipant above already loaded it for free - used to notify
    // every participant's personal room, not just the conversation room,
    // so a client that hasn't opened this specific conversation yet still
    // learns a new message arrived (see sockets/index.js's per-userId room
    // from Phase 8).
    const participantIds = conversation.participants.map((p) => p.toString());
    return { message, created: true, participantIds };
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
      return { message: existing, created: false, participantIds: [] };
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

// Marks one message delivered to the current user. Idempotent and silent
// on a duplicate call or a sender marking their own message - both return
// { delivered: false } rather than an error, since neither is a mistake a
// client should be scolded for (a reconnect can easily re-fire this).
export const markDelivered = async (userId, messageId) => {
  const message = await Message.findById(messageId);
  if (!message) {
    throw new AppError('Message not found', 404, 'MESSAGE_NOT_FOUND');
  }

  await assertParticipant(userId, message.conversation);

  if (message.sender.toString() === userId.toString()) {
    return { message, delivered: false };
  }

  // The query condition ('deliveredTo.user': { $ne: userId }) makes this
  // atomic: if two "delivered" acks for the same message and user race
  // each other, only one of them actually matches and updates.
  const updated = await Message.findOneAndUpdate(
    { _id: messageId, 'deliveredTo.user': { $ne: userId } },
    {
      $push: { deliveredTo: { user: userId, deliveredAt: new Date() } },
      // Only upgrade sent -> delivered; never downgrade a message that's
      // already been read by someone back down to "just delivered".
      ...(message.status === 'sent' ? { $set: { status: 'delivered' } } : {}),
    },
    { new: true }
  );

  if (!updated) {
    return { message, delivered: false }; // already delivered, including a lost race
  }

  return { message: updated, delivered: true };
};

// Marks every unread message in a conversation as read by the current
// user, in one batch - matching "user opens the conversation", not
// per-message scroll tracking. Returns which messages were newly marked,
// grouped by sender, so the caller can notify each sender once with the
// full list rather than firing one event per message.
export const markConversationRead = async (userId, conversationId) => {
  await assertParticipant(userId, conversationId);

  const messagesToMark = await Message.find({
    conversation: conversationId,
    sender: { $ne: userId },
    'readBy.user': { $ne: userId },
  }).select('_id sender');

  if (messagesToMark.length === 0) {
    return { messageIds: [], bySender: new Map() };
  }

  const messageIds = messagesToMark.map((m) => m._id);

  await Message.updateMany(
    { _id: { $in: messageIds } },
    { $push: { readBy: { user: userId, readAt: new Date() } }, $set: { status: 'read' } }
  );

  const bySender = new Map();
  messagesToMark.forEach((m) => {
    const senderId = m.sender.toString();
    if (!bySender.has(senderId)) bySender.set(senderId, []);
    bySender.get(senderId).push(m._id.toString());
  });

  return { messageIds: messageIds.map((id) => id.toString()), bySender };
};
