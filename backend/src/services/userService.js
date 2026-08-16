import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { escapeRegex } from '../utils/escapeRegex.js';
import { getCachedProfile, setCachedProfile, invalidateProfileCache } from './cacheService.js';

// What a user is allowed to see about *someone else* - deliberately
// excludes email and blockedUsers, unlike a user's own /me profile.
const PUBLIC_PROFILE_FIELDS = 'name avatar bio isOnline lastSeen';

// Cache-aside: check Redis first, fall back to Mongo on a miss (or a
// Redis error), then populate the cache for next time. See
// cacheService.js for why this endpoint specifically, and what isn't
// cached this way.
export const getPublicProfile = async (userId) => {
  const cached = await getCachedProfile(userId);
  if (cached) return cached;

  const user = await User.findById(userId).select(PUBLIC_PROFILE_FIELDS);
  if (!user) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }

  const profile = user.toJSON();
  await setCachedProfile(userId, profile);
  return profile;
};

export const updateProfile = async (userId, updates) => {
  const user = await User.findByIdAndUpdate(userId, updates, { new: true, runValidators: true });
  await invalidateProfileCache(userId); // name/bio just changed - the cached snapshot is stale now
  return user;
};

export const searchUsers = async (currentUserId, query) => {
  const currentUser = await User.findById(currentUserId).select('blockedUsers');
  const usersWhoBlockedMe = await User.find({ blockedUsers: currentUserId }).select('_id');

  const excludedIds = [currentUserId, ...currentUser.blockedUsers, ...usersWhoBlockedMe.map((u) => u._id)];

  return User.find({
    _id: { $nin: excludedIds },
    name: { $regex: `^${escapeRegex(query)}`, $options: 'i' },
  })
    .select(PUBLIC_PROFILE_FIELDS)
    .limit(20);
};

export const blockUser = async (currentUserId, targetUserId) => {
  if (currentUserId.toString() === targetUserId) {
    throw new AppError('You cannot block yourself', 400, 'CANNOT_BLOCK_SELF');
  }

  const targetUser = await User.findById(targetUserId).select('_id');
  if (!targetUser) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }

  const currentUser = await User.findById(currentUserId);
  const alreadyBlocked = currentUser.blockedUsers.some((id) => id.toString() === targetUserId);
  if (alreadyBlocked) {
    throw new AppError('User is already blocked', 409, 'ALREADY_BLOCKED');
  }

  currentUser.blockedUsers.push(targetUserId);
  await currentUser.save();
};

export const unblockUser = async (currentUserId, targetUserId) => {
  const currentUser = await User.findById(currentUserId);
  const isBlocked = currentUser.blockedUsers.some((id) => id.toString() === targetUserId);
  if (!isBlocked) {
    throw new AppError('User is not blocked', 404, 'NOT_BLOCKED');
  }

  currentUser.blockedUsers = currentUser.blockedUsers.filter((id) => id.toString() !== targetUserId);
  await currentUser.save();
};

// Reused starting Phase 5 to stop blocked users from messaging each other.
export const areBlocked = async (userIdA, userIdB) => {
  const count = await User.countDocuments({
    $or: [
      { _id: userIdA, blockedUsers: userIdB },
      { _id: userIdB, blockedUsers: userIdA },
    ],
  });
  return count > 0;
};
