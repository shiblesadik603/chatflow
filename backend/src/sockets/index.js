import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { corsOptions } from '../config/cors.js';
import { logger } from '../config/logger.js';
import { redis } from '../config/redis.js';
import { socketAuth } from './socketAuth.js';
import { registerMessageHandlers } from './messageHandlers.js';
import { registerTypingHandlers } from './typingHandlers.js';
import { registerReadReceiptHandlers } from './readReceiptHandlers.js';
import { handlePresenceConnect, handlePresenceDisconnect } from './presenceHandlers.js';

let io = null;
let pubClient = null;
let subClient = null;

// Without this adapter, io.to(room).emit(...) only reaches sockets
// connected to *this* process - the exact same in-memory-state problem
// Phase 16 solved for rate limiting, here applied to real-time delivery.
// Run two backend instances and a message sent by a user on instance 1 to
// a room containing a user connected to instance 2 would silently never
// arrive live (Phase 8-13's room-based broadcasts all rely on this).
//
// The adapter works via Redis pub/sub: every instance calling
// io.to(room).emit(...) publishes to a Redis channel, and every instance
// (including the publisher) is subscribed and delivers to whichever of
// *its own* local sockets are in that room. Local, same-instance delivery
// never depends on Redis at all - only the cross-instance relay does, so
// a Redis outage degrades multi-instance delivery without breaking a
// single-instance deployment.
//
// Redis pub/sub needs its own dedicated connections - a client that's
// subscribed can't also issue normal commands - so these are created via
// .duplicate() (clones the connection config, not the connection itself)
// rather than reusing the app's main `redis` client. Created lazily and
// shared across repeated initializeSocket() calls within one process, so
// callers (including every socket test file) don't each need their own
// cleanup logic for a second pair of connections - closeSocketAdapter()
// below is the single place that happens.
const getAdapterClients = () => {
  if (!pubClient) {
    pubClient = redis.duplicate();
    subClient = redis.duplicate();
  }
  return { pubClient, subClient };
};

export const closeSocketAdapter = async () => {
  if (!pubClient) return;
  await pubClient.quit();
  await subClient.quit();
  pubClient = null;
  subClient = null;
};

export const initializeSocket = (httpServer) => {
  const { pubClient: pub, subClient: sub } = getAdapterClients();

  // A local const, not just an assignment to the module-level `io` - the
  // connection handler below closes over THIS instance specifically. In
  // real deployment there's only ever one Server per process, so this
  // distinction is invisible; it only matters when more than one
  // initializeSocket() call exists in the same process, which is exactly
  // what testing multi-instance behavior requires (see
  // socketRedisAdapter.test.js). Without this, every server's connection
  // handler would close over the *shared* module-level `io` variable and
  // all end up reading whichever instance was created last, silently
  // routing every broadcast through one Server object regardless of which
  // physical instance a socket actually connected to.
  const ioInstance = new Server(httpServer, { cors: corsOptions });
  ioInstance.adapter(createAdapter(pub, sub));
  io = ioInstance; // module-level singleton for getIO() - fine for the real one-per-process case

  ioInstance.use(socketAuth);

  ioInstance.on('connection', async (socket) => {
    logger.info(`Socket connected: user=${socket.userId} socket=${socket.id}`);

    // Every socket a user opens (multiple tabs, multiple devices) joins a
    // room named after their own userId. This lets later code reach "all
    // of this user's active connections" with io.to(userId).emit(...)
    // without tracking socket ids anywhere - presence relies on this.
    socket.join(socket.userId);

    // All event listeners are registered synchronously, before any
    // `await`, so nothing sent by the client can arrive before its
    // handler exists.
    registerMessageHandlers(ioInstance, socket);
    registerTypingHandlers(socket);
    registerReadReceiptHandlers(ioInstance, socket);

    socket.on('disconnect', async (reason) => {
      logger.info(`Socket disconnected: user=${socket.userId} socket=${socket.id} reason=${reason}`);
      await handlePresenceDisconnect(ioInstance, socket);
    });

    // Awaited before the "authenticated" ack, so by the time the client
    // knows it's connected, the server has already finished updating and
    // broadcasting presence for this connection.
    await handlePresenceConnect(ioInstance, socket);

    socket.emit('authenticated', { userId: socket.userId });
  });

  return ioInstance;
};

// Lets later phases (message service, etc.) emit events without importing
// this file's Server instance directly or risking a circular import.
export const getIO = () => {
  if (!io) {
    throw new Error('Socket.IO has not been initialized yet - call initializeSocket(server) first');
  }
  return io;
};
