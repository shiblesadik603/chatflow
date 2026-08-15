import { Group } from '../models/Group.js';
import { Conversation } from '../models/Conversation.js';
import { Message } from '../models/Message.js';
import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { createSystemMessage } from './messageService.js';

const MEMBER_FIELDS = 'name avatar isOnline lastSeen';

const populateGroup = (query) => query.populate('members', MEMBER_FIELDS).populate('admins', MEMBER_FIELDS);

const fetchGroupOrThrow = async (groupId) => {
  const group = await Group.findById(groupId);
  if (!group) {
    throw new AppError('Group not found', 404, 'GROUP_NOT_FOUND');
  }
  return group;
};

const assertMember = (userId, group) => {
  const isMember = group.members.some((m) => m.toString() === userId.toString());
  if (!isMember) {
    throw new AppError('You are not a member of this group', 403, 'NOT_A_MEMBER');
  }
};

const assertAdmin = (userId, group) => {
  const isAdmin = group.admins.some((a) => a.toString() === userId.toString());
  if (!isAdmin) {
    throw new AppError('Only group admins can do this', 403, 'NOT_GROUP_ADMIN');
  }
};

export const createGroup = async (creatorId, { name, description, avatar, memberIds }) => {
  const uniqueMemberIds = [...new Set(memberIds.map((id) => id.toString()))].filter(
    (id) => id !== creatorId.toString()
  );

  const foundUsers = await User.find({ _id: { $in: uniqueMemberIds } }).select('_id');
  if (foundUsers.length !== uniqueMemberIds.length) {
    throw new AppError('One or more members were not found', 404, 'USER_NOT_FOUND');
  }

  const allParticipantIds = [creatorId, ...uniqueMemberIds];

  // No multi-document transaction: a local standalone MongoDB (no replica
  // set) doesn't support them. In production - e.g. MongoDB Atlas, which
  // runs as a replica set by default - this create-then-link sequence
  // would normally run inside a session transaction for atomicity.
  const conversation = await Conversation.create({ type: 'group', participants: allParticipantIds });

  const group = await Group.create({
    name,
    description: description || '',
    avatar: avatar || '',
    admins: [creatorId],
    members: allParticipantIds,
    conversation: conversation._id,
  });

  conversation.group = group._id;
  await conversation.save();

  return populateGroup(Group.findById(group._id));
};

export const getGroupById = async (userId, groupId) => {
  // Membership check runs on the unpopulated document, same as every
  // other function here - group.members after populate() holds full user
  // objects, and ObjectId.toString() on those never matches a raw user id.
  const group = await fetchGroupOrThrow(groupId);
  assertMember(userId, group);
  return populateGroup(Group.findById(groupId));
};

export const updateGroup = async (userId, groupId, updates) => {
  const group = await fetchGroupOrThrow(groupId);
  assertAdmin(userId, group);

  const previousName = group.name;
  Object.assign(group, updates);
  await group.save();

  let systemMessage = null;
  if (updates.name && updates.name !== previousName) {
    systemMessage = await createSystemMessage(
      group.conversation,
      userId,
      `renamed the group to "${updates.name}"`
    );
  }

  return { group: await populateGroup(Group.findById(group._id)), systemMessage };
};

export const addMembers = async (userId, groupId, memberIds) => {
  const group = await fetchGroupOrThrow(groupId);
  assertAdmin(userId, group);

  const existingIds = new Set(group.members.map((m) => m.toString()));
  const newIds = [...new Set(memberIds.map((id) => id.toString()))].filter((id) => !existingIds.has(id));

  if (newIds.length === 0) {
    return { group: await populateGroup(Group.findById(group._id)), addedCount: 0, systemMessage: null };
  }

  const foundUsers = await User.find({ _id: { $in: newIds } }).select('_id name');
  if (foundUsers.length !== newIds.length) {
    throw new AppError('One or more members were not found', 404, 'USER_NOT_FOUND');
  }

  group.members.push(...newIds);
  await group.save();
  await Conversation.findByIdAndUpdate(group.conversation, {
    $addToSet: { participants: { $each: newIds } },
  });

  const names = foundUsers.map((u) => u.name).join(', ');
  const systemMessage = await createSystemMessage(group.conversation, userId, `added ${names} to the group`);

  return { group: await populateGroup(Group.findById(group._id)), addedCount: newIds.length, systemMessage };
};

export const removeMember = async (userId, groupId, targetUserId) => {
  const group = await fetchGroupOrThrow(groupId);
  assertAdmin(userId, group);

  if (targetUserId === userId.toString()) {
    throw new AppError('Use the leave-group endpoint to remove yourself', 400, 'USE_LEAVE_ENDPOINT');
  }

  const isMember = group.members.some((m) => m.toString() === targetUserId);
  if (!isMember) {
    throw new AppError('That user is not a member of this group', 404, 'MEMBER_NOT_FOUND');
  }

  const targetUser = await User.findById(targetUserId).select('name');

  group.members = group.members.filter((m) => m.toString() !== targetUserId);
  group.admins = group.admins.filter((a) => a.toString() !== targetUserId);
  await group.save();
  await Conversation.findByIdAndUpdate(group.conversation, { $pull: { participants: targetUserId } });

  const systemMessage = await createSystemMessage(
    group.conversation,
    userId,
    `removed ${targetUser?.name || 'a member'} from the group`
  );

  return { group: await populateGroup(Group.findById(group._id)), systemMessage };
};

export const leaveGroup = async (userId, groupId) => {
  const group = await fetchGroupOrThrow(groupId);
  assertMember(userId, group);

  group.members = group.members.filter((m) => m.toString() !== userId.toString());
  group.admins = group.admins.filter((a) => a.toString() !== userId.toString());

  if (group.members.length === 0) {
    // Nobody left - the group and its conversation/messages have no
    // reason to keep existing.
    await Message.deleteMany({ conversation: group.conversation });
    await Conversation.deleteOne({ _id: group.conversation });
    await Group.deleteOne({ _id: group._id });
    return { deleted: true };
  }

  if (group.admins.length === 0) {
    // The last admin just left - a group can never be without one, so
    // promote whoever has been a member the longest.
    group.admins = [group.members[0]];
  }

  await group.save();
  await Conversation.findByIdAndUpdate(group.conversation, { $pull: { participants: userId } });

  const systemMessage = await createSystemMessage(group.conversation, userId, 'left the group');

  return { deleted: false, group: await populateGroup(Group.findById(group._id)), systemMessage };
};

export const promoteAdmin = async (userId, groupId, targetUserId) => {
  const group = await fetchGroupOrThrow(groupId);
  assertAdmin(userId, group);

  const isMember = group.members.some((m) => m.toString() === targetUserId);
  if (!isMember) {
    throw new AppError('That user must be a member before becoming an admin', 400, 'NOT_A_MEMBER');
  }

  const isAlreadyAdmin = group.admins.some((a) => a.toString() === targetUserId);
  if (isAlreadyAdmin) {
    throw new AppError('That user is already an admin', 409, 'ALREADY_ADMIN');
  }

  const targetUser = await User.findById(targetUserId).select('name');

  group.admins.push(targetUserId);
  await group.save();

  const systemMessage = await createSystemMessage(
    group.conversation,
    userId,
    `made ${targetUser?.name || 'a member'} an admin`
  );

  return { group: await populateGroup(Group.findById(group._id)), systemMessage };
};
