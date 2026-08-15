import { Conversation } from '../models/Conversation.js';
import { Message } from '../models/Message.js';
import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { areBlocked } from './userService.js';

const PARTICIPANT_FIELDS = 'name avatar isOnline lastSeen';

const populateConversation = (query) =>
  query
    .populate('participants', PARTICIPANT_FIELDS)
    .populate('lastMessage')
    .populate('group', 'name avatar');

export const createOrGetPrivateConversation = async (currentUserId, otherUserId) => {
  if (currentUserId.toString() === otherUserId) {
    throw new AppError('You cannot start a conversation with yourself', 400, 'CANNOT_MESSAGE_SELF');
  }

  const otherUser = await User.findById(otherUserId).select('_id');
  if (!otherUser) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }

  if (await areBlocked(currentUserId, otherUserId)) {
    throw new AppError('You cannot start a conversation with this user', 403, 'BLOCKED');
  }

  const participantsKey = [currentUserId.toString(), otherUserId.toString()].sort().join('_');

  const existing = await populateConversation(Conversation.findOne({ type: 'private', participantsKey }));
  if (existing) {
    return { conversation: existing, created: false };
  }

  try {
    const created = await Conversation.create({
      type: 'private',
      participants: [currentUserId, otherUserId],
    });
    const conversation = await populateConversation(Conversation.findById(created._id));
    return { conversation, created: true };
  } catch (err) {
    if (err.code === 11000) {
      // Lost the race: another request created it between our check and our
      // insert. The unique index is the real source of truth here - we just
      // fetch what it let through.
      const conversation = await populateConversation(
        Conversation.findOne({ type: 'private', participantsKey })
      );
      return { conversation, created: false };
    }
    throw err;
  }
};

export const listConversations = (userId) =>
  populateConversation(Conversation.find({ participants: userId })).sort({ updatedAt: -1 });

// Lightweight participant check (no populate) - reused by messageService so
// it doesn't have to duplicate this logic for its own conversation lookups.
export const assertParticipant = async (userId, conversationId) => {
  const conversation = await Conversation.findById(conversationId);
  if (!conversation) {
    throw new AppError('Conversation not found', 404, 'CONVERSATION_NOT_FOUND');
  }
  const isParticipant = conversation.participants.some((p) => p.toString() === userId.toString());
  if (!isParticipant) {
    throw new AppError('You are not part of this conversation', 403, 'NOT_A_PARTICIPANT');
  }
  return conversation;
};

const findConversationForParticipant = async (userId, conversationId) => {
  const conversation = await populateConversation(Conversation.findById(conversationId));
  if (!conversation) {
    throw new AppError('Conversation not found', 404, 'CONVERSATION_NOT_FOUND');
  }

  const isParticipant = conversation.participants.some((p) => p._id.toString() === userId.toString());
  if (!isParticipant) {
    throw new AppError('You are not part of this conversation', 403, 'NOT_A_PARTICIPANT');
  }

  return conversation;
};

export const getConversationById = (userId, conversationId) =>
  findConversationForParticipant(userId, conversationId);

export const deleteConversation = async (userId, conversationId) => {
  const conversation = await findConversationForParticipant(userId, conversationId);

  if (conversation.type === 'group') {
    throw new AppError(
      'Use the leave-group endpoint to leave a group conversation',
      400,
      'USE_GROUP_LEAVE_ENDPOINT'
    );
  }

  await Message.deleteMany({ conversation: conversation._id });
  await Conversation.deleteOne({ _id: conversation._id });
};
