import { User } from '../models/User.js';
import { logger } from '../config/logger.js';
import * as presenceService from '../services/presenceService.js';

export const handlePresenceConnect = async (io, socket) => {
  try {
    const justCameOnline = await presenceService.addConnection(socket.userId, socket.id);
    if (!justCameOnline) return; // another tab/device already had this user online

    await User.findByIdAndUpdate(socket.userId, { isOnline: true });

    const contactIds = await presenceService.getContactIds(socket.userId);
    contactIds.forEach((contactId) => {
      io.to(contactId).emit('user_online', { userId: socket.userId });
    });
  } catch (err) {
    // Presence is best-effort - a Redis or Mongo hiccup here should never
    // take down the socket connection itself, just log and move on.
    logger.error(`Presence connect error for user=${socket.userId}: ${err.message}`);
  }
};

export const handlePresenceDisconnect = async (io, socket) => {
  try {
    const wentOffline = await presenceService.removeConnection(socket.userId, socket.id);
    if (!wentOffline) return; // user still has other active connections

    const lastSeen = new Date();
    await User.findByIdAndUpdate(socket.userId, { isOnline: false, lastSeen });

    const contactIds = await presenceService.getContactIds(socket.userId);
    contactIds.forEach((contactId) => {
      io.to(contactId).emit('user_offline', { userId: socket.userId, lastSeen });
    });
  } catch (err) {
    logger.error(`Presence disconnect error for user=${socket.userId}: ${err.message}`);
  }
};
