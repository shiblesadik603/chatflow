import { redis } from '../../src/config/redis.js';

// Reuses the app's own Redis client - the test npm script points
// REDIS_URL at db index 1 (see package.json), a separate logical database
// from dev's db 0, so this never touches real dev presence data.
export const clearTestRedis = () => redis.flushdb();

export const disconnectTestRedis = () => redis.quit();
