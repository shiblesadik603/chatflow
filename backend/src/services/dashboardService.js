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
