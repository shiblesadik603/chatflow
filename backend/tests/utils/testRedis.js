import { redis } from '../../src/config/redis.js';
import { closeSocketAdapter } from '../../src/sockets/index.js';

// Reuses the app's own Redis client - the test npm script points
// REDIS_URL at db index 1 (see package.json), a separate logical database
// from dev's db 0, so this never touches real dev presence data.
export const clearTestRedis = () => redis.flushdb();

export const disconnectTestRedis = async () => {
  // Every socket test file's initializeSocket() call now also opens the
  // Redis adapter's pub/sub connections (Phase 17). Centralizing their
  // cleanup here means none of those files need their own extra teardown
  // logic - the same lesson from the dangling-connection debugging in
  // Phases 10/12/15/16: whichever file opens a Redis connection is
  // responsible for closing it, so keep that responsibility in as few
  // places as possible.
  await closeSocketAdapter();
  await redis.quit();
};
