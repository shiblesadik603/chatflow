import mongoose from 'mongoose';
import { redis } from '../config/redis.js';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { Conversation } from '../models/Conversation.js';
import { Message } from '../models/Message.js';

const MONGO_READY_STATES = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
};

export const getStatus = async () => {
  const [totalUsers, onlineUsers, totalConversations, totalMessages] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ isOnline: true }),
    Conversation.countDocuments(),
    Message.countDocuments(),
  ]);

  return {
    environment: env.NODE_ENV,
    uptimeSeconds: Math.floor(process.uptime()),
    memory: process.memoryUsage(),
    nodeVersion: process.version,
    // Deliberately different from /api/health, which checks neither on
    // purpose (Phase 1) - a liveness probe only needs to know the process
    // itself is up, but a dashboard needs to know if a *dependency* is
    // down, since Redis being down degrades presence/caching/rate-limiting
    // without crashing the app (see redis.js), and that's exactly the kind
    // of partial-degradation state worth surfacing here.
    mongo: { status: MONGO_READY_STATES[mongoose.connection.readyState] || 'unknown' },
    redis: { status: redis.status },
    counts: { totalUsers, onlineUsers, totalConversations, totalMessages },
  };
};

// Deliberately operates on the app's real, shared Redis client rather than
// a fake toggle - every other test/comment in this codebase referencing
// "Redis is down" behavior (rateLimiter, cacheService, presenceService)
// means it literally, and the whole point of this pair of functions is to
// make that same real condition reproducible on demand instead of
// requiring someone to go stop the actual Redis process by hand. Every
// other connected client (presence, caching, rate limiting) shares this
// exact instance, so disconnecting it here means they all genuinely see
// Redis as down, exactly as if the process had died.
export const simulateRedisDown = () => {
  if (redis.status === 'end') {
    return Promise.resolve({ status: redis.status });
  }
  // disconnect() updates redis.status asynchronously (via the socket's own
  // 'end' event), not the moment this call returns - resolving immediately
  // after calling it would be a race that reports "ready" for a request
  // that arrives a few milliseconds too early.  disconnect() (unlike
  // quit()) also skips a clean QUIT handshake and disables ioredis's own
  // auto-reconnect - without that second part, it would just silently
  // reconnect on its own before anyone got to see the "down" state.
  return new Promise((resolve) => {
    redis.once('end', () => resolve({ status: redis.status }));
    redis.disconnect();
  });
};

export const restoreRedis = async () => {
  if (redis.status === 'end') {
    // connect() throws if called while already connected/connecting, so
    // this only runs from the exact state simulateRedisDown() leaves it in.
    await redis.connect();
  }
  return { status: redis.status };
};
