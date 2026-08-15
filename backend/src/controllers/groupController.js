import * as groupService from '../services/groupService.js';
import { getIO } from '../sockets/index.js';

// Group system messages (member added/removed, renamed, promoted) flow
// through the same new_message broadcast every regular message uses -
// no new socket event type needed.
const broadcastSystemMessage = (group, systemMessage) => {
  if (systemMessage) {
    getIO().to(group.conversation.toString()).emit('new_message', systemMessage);
  }
};

export const createGroup = async (req, res, next) => {
  try {
    const group = await groupService.createGroup(req.user._id, req.body);
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
    broadcastSystemMessage(group, systemMessage);
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
