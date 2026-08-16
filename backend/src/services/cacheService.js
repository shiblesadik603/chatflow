import { redis } from '../config/redis.js';
import { logger } from '../config/logger.js';

// --- What's cached here, and what deliberately isn't ---
//
// Cached: public user profiles (GET /api/users/:id). Read-heavy - every
// chat header, member list, and profile view triggers one - and changes
// infrequently (name/bio/avatar). A short TTL plus explicit invalidation
// on writes keeps it correct without hand-tracking every place a profile
// could change.
//
// Note the tradeoff being made explicitly: the cached snapshot includes
// isOnline/lastSeen. presenceHandlers.js (Phase 10) invalidates this cache
// on every connect/disconnect specifically so that field doesn't go stale
// for the TTL window - discovered the hard way when a presence test
// caught a cached "online" snapshot outliving an actual disconnect. Worth
// noting anyway: this cache backs a "look up someone's profile" read, not
// the primary way online status reaches a client - that's the real-time
// user_online/user_offline broadcast from Phase 10, which is unaffected
// by this cache entirely regardless.
//
// Deliberately NOT cached:
// - Search results (Phase 4): depend on the requester's own block
//   relationships, so a shared cache key can't work without exploding
//   into one cache entry per requester per query - not worth it for
//   results that are cheap to compute and rarely repeated verbatim.
// - Conversation lists (Phase 5): invalidated by every new message in any
//   of a user's conversations. The invalidation surface would be huge,
//   and a stale list silently hiding a new message is exactly the kind
//   of bug users notice immediately - the risk isn't worth the savings.

const PROFILE_TTL_SECONDS = 60;
const profileKey = (userId) => `cache:profile:${userId}`;

// Caching is optional by definition - a Redis hiccup here should mean a
// cache miss (fall back to Mongo), never a broken request. Every function
// below swallows its own errors for exactly that reason.

export const getCachedProfile = async (userId) => {
  try {
    const raw = await redis.get(profileKey(userId));
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    logger.error(`Profile cache read failed (falling back to Mongo): ${err.message}`);
    return null;
  }
};

export const setCachedProfile = async (userId, profile) => {
  try {
    await redis.set(profileKey(userId), JSON.stringify(profile), 'EX', PROFILE_TTL_SECONDS);
  } catch (err) {
    logger.error(`Profile cache write failed (non-fatal): ${err.message}`);
  }
};

export const invalidateProfileCache = async (userId) => {
  try {
    await redis.del(profileKey(userId));
  } catch (err) {
    logger.error(`Profile cache invalidation failed (non-fatal): ${err.message}`);
  }
};
