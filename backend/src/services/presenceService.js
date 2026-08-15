import { redis } from '../config/redis.js';
import { Conversation } from '../models/Conversation.js';

const socketsKey = (userId) => `presence:sockets:${userId}`;

// --- Why Redis, and not MongoDB, and not an in-memory Map? ---
//
// MongoDB (User.isOnline / User.lastSeen) holds the durable, "last known"
// state - what the REST API returns, what survives a server restart, what
// stays correct even if nobody is currently connected.
//
// Redis holds the ephemeral, high-churn fact "which socket ids are open
// for this user right now." Writing that to MongoDB on every connect and
// disconnect would mean a database write for something that changes
// constantly and means nothing once the process restarts anyway.
//
// A plain in-memory JS Map would work too, until you run more than one
// backend instance (see Phase 17): a Map only knows about sockets connected
// to *that* process. If Alice is connected to server 1 and Bob (checking
// whether Alice is online) is connected to server 2, an in-memory Map on
// server 2 has no idea Alice exists. Redis is the shared source of truth
// every instance can read and write, which is exactly what horizontal
// scaling requires.

// Returns true if this was the user's FIRST active connection - i.e. they
// just came online, as opposed to opening a second tab/device.
export const addConnection = async (userId, socketId) => {
  await redis.sadd(socketsKey(userId), socketId);
  const count = await redis.scard(socketsKey(userId));
  return count === 1;
};

// Returns true if this was the user's LAST active connection - i.e. they
// just went offline. A user is only offline once every socket (every tab,
// every device) has disconnected.
export const removeConnection = async (userId, socketId) => {
  await redis.srem(socketsKey(userId), socketId);
  const count = await redis.scard(socketsKey(userId));
  return count === 0;
};

export const isOnline = async (userId) => (await redis.scard(socketsKey(userId))) > 0;

// The audience for presence broadcasts: everyone who shares at least one
// conversation with this user - not every user on the platform. Reuses the
// per-user room (io.to(userId)) every socket already joins on connect
// (Phase 8), so this reaches all of a contact's active devices at once.
export const getContactIds = async (userId) => {
  const conversations = await Conversation.find({ participants: userId }).select('participants');
  const ids = new Set();
  conversations.forEach((conversation) => {
    conversation.participants.forEach((participantId) => {
      if (participantId.toString() !== userId.toString()) {
        ids.add(participantId.toString());
      }
    });
  });
  return [...ids];
};
