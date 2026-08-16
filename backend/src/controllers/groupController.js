import * as groupService from '../services/groupService.js';
import { getIO } from '../sockets/index.js';

// Group system messages (member added/removed, renamed, promoted) flow
// through the same new_message broadcast every regular message uses -
// no new socket event type needed.
//
// Also mirrors messageController's conversation_activity broadcast (Phase
// 21 checkpoint 1's fix): new_message is room-scoped to sockets that
// called join_conversation, so a member who hasn't opened this group yet
// would never see its sidebar preview/order update without this. extraUserIds
// covers removeMember specifically - the removed user is no longer in
// group.members by the time this runs, but they still need a signal to
// refetch their conversation list (which will now correctly omit this
// group, since they're no longer a participant).
const broadcastSystemMessage = (group, systemMessage, extraUserIds = []) => {
  if (!systemMessage) return;
  const io = getIO();
  const conversationId = group.conversation.toString();
  io.to(conversationId).emit('new_message', systemMessage);
  const memberIds = group.members.map((m) => m._id.toString());
  new Set([...memberIds, ...extraUserIds]).forEach((userId) =>
    io.to(userId).emit('conversation_activity', { conversationId })
  );
};

export const createGroup = async (req, res, next) => {
  try {
    const group = await groupService.createGroup(req.user._id, req.body);
    // No system message here (there's nothing to narrate - creation IS the
    // event), but members besides the creator still need a live signal that
    // a new conversation exists, same reasoning as the rest of this file.
    const io = getIO();
    const conversationId = group.conversation.toString();
    group.members.forEach((m) => io.to(m._id.toString()).emit('conversation_activity', { conversationId }));
    res.status(201).json({ success: true, data: { group } });
  } catch (err) {
    next(err);
  }
};

export const getGroup = async (req, res, next) => {
  try {
    const group = await groupService.getGroupById(req.user._id, req.params.id);
    res.status(200).json({ success: true, data: { group } });
  } catch (err) {
    next(err);
  }
};

export const updateGroup = async (req, res, next) => {
  try {
    const { group, systemMessage } = await groupService.updateGroup(req.user._id, req.params.id, req.body);
    broadcastSystemMessage(group, systemMessage);
    res.status(200).json({ success: true, data: { group } });
  } catch (err) {
    next(err);
  }
};

export const addMembers = async (req, res, next) => {
  try {
    const { group, addedCount, systemMessage } = await groupService.addMembers(
      req.user._id,
      req.params.id,
      req.body.memberIds
    );
    broadcastSystemMessage(group, systemMessage);
    res.status(200).json({ success: true, data: { group, addedCount } });
  } catch (err) {
    next(err);
  }
};

export const removeMember = async (req, res, next) => {
  try {
    const { group, systemMessage } = await groupService.removeMember(
      req.user._id,
      req.params.id,
      req.params.userId
    );
    broadcastSystemMessage(group, systemMessage, [req.params.userId]);
    res.status(200).json({ success: true, data: { group } });
  } catch (err) {
    next(err);
  }
};

export const leaveGroup = async (req, res, next) => {
  try {
    const result = await groupService.leaveGroup(req.user._id, req.params.id);
    if (!result.deleted) {
      broadcastSystemMessage(result.group, result.systemMessage);
    }
    res.status(200).json({ success: true, data: { deleted: result.deleted } });
  } catch (err) {
    next(err);
  }
};

export const promoteAdmin = async (req, res, next) => {
  try {
    const { group, systemMessage } = await groupService.promoteAdmin(
      req.user._id,
      req.params.id,
      req.body.userId
    );
    broadcastSystemMessage(group, systemMessage);
    res.status(200).json({ success: true, data: { group } });
  } catch (err) {
    next(err);
  }
};
