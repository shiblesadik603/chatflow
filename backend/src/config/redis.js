import Redis from 'ioredis';
import { env } from './env.js';
import { logger } from './logger.js';

// Unlike Mongo (config/db.js), nothing here is awaited before the server
// starts listening. Redis in this app backs presence tracking only - a
// disposable, rebuildable-on-reconnect signal, not data. If Redis is down,
// the app should still serve chats, auth, and everything else; presence
// just degrades until Redis comes back. See presenceService.js.
export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
});

redis.on('connect', () => logger.info('Redis connected'));
redis.on('error', (err) => logger.error(`Redis connection error: ${err.message}`));
