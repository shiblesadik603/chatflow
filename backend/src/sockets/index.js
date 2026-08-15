import { Server } from 'socket.io';
import { corsOptions } from '../config/cors.js';
import { logger } from '../config/logger.js';
import { socketAuth } from './socketAuth.js';

let io = null;

export const initializeSocket = (httpServer) => {
  io = new Server(httpServer, { cors: corsOptions });

  io.use(socketAuth);

  io.on('connection', (socket) => {
    logger.info(`Socket connected: user=${socket.userId} socket=${socket.id}`);

    // Confirms to the client that the handshake succeeded and tells it
    // which user the server thinks it authenticated as - useful for the
    // frontend, and exactly what the tests in this phase assert on.
    socket.emit('authenticated', { userId: socket.userId });

    // Event handlers for actual chat behavior (join_conversation,
    // send_message, ...) are added starting Phase 8.

    socket.on('disconnect', (reason) => {
      logger.info(`Socket disconnected: user=${socket.userId} socket=${socket.id} reason=${reason}`);
    });
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
