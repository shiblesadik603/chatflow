import { Server } from 'socket.io';
import { corsOptions } from '../config/cors.js';
import { logger } from '../config/logger.js';
import { socketAuth } from './socketAuth.js';
import { registerMessageHandlers } from './messageHandlers.js';
import { registerTypingHandlers } from './typingHandlers.js';
import { registerReadReceiptHandlers } from './readReceiptHandlers.js';
import { handlePresenceConnect, handlePresenceDisconnect } from './presenceHandlers.js';

let io = null;

export const initializeSocket = (httpServer) => {
  io = new Server(httpServer, { cors: corsOptions });

  io.use(socketAuth);

  io.on('connection', async (socket) => {
    logger.info(`Socket connected: user=${socket.userId} socket=${socket.id}`);

    // Every socket a user opens (multiple tabs, multiple devices) joins a
    // room named after their own userId. This lets later code reach "all
    // of this user's active connections" with io.to(userId).emit(...)
    // without tracking socket ids anywhere - presence relies on this.
    socket.join(socket.userId);

    // All event listeners are registered synchronously, before any
    // `await`, so nothing sent by the client can arrive before its
    // handler exists.
    registerMessageHandlers(io, socket);
    registerTypingHandlers(socket);
    registerReadReceiptHandlers(io, socket);

    socket.on('disconnect', async (reason) => {
      logger.info(`Socket disconnected: user=${socket.userId} socket=${socket.id} reason=${reason}`);
      await handlePresenceDisconnect(io, socket);
    });

    // Awaited before the "authenticated" ack, so by the time the client
    // knows it's connected, the server has already finished updating and
    // broadcasting presence for this connection.
    await handlePresenceConnect(io, socket);

    socket.emit('authenticated', { userId: socket.userId });
  });

  return io;
};

// Lets later phases (message service, etc.) emit events without importing
// this file's Server instance directly or risking a circular import.
export const getIO = () => {
  if (!io) {
    throw new Error('Socket.IO has not been initialized yet - call initializeSocket(server) first');
  }
  return io;
};
