import http from 'http';
import mongoose from 'mongoose';
import { app } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { connectDB } from './config/db.js';
import { redis } from './config/redis.js';
import { initializeSocket, getIO, closeSocketAdapter } from './sockets/index.js';

const server = http.createServer(app);
initializeSocket(server);

const start = async () => {
  try {
    await connectDB();
    server.listen(env.PORT, () => {
      logger.info(`ChatFlow API listening on port ${env.PORT} [${env.NODE_ENV}]`);
    });
  } catch (err) {
    logger.error(`Failed to start server: ${err.message}`);
    process.exit(1);
  }
};

start();

// Node will happily wait forever for a stuck socket or a hung DB call -
// server.close() alone has no bound on that. This guarantees the process
// actually exits within a fixed window either way. The tradeoff is a small
// chance of dropping the very last in-flight request versus the much
// larger risk of an orchestrator (Docker, k8s) waiting out its own grace
// period and SIGKILLing the process anyway, which skips this cleanup
// entirely and can leave Mongo/Redis connections in a worse state than a
// forced process.exit() would.
const SHUTDOWN_TIMEOUT_MS = 10000;

let isShuttingDown = false;

const shutdown = (signal, exitCode = 0) => {
  // A second SIGTERM/SIGINT while already draining shouldn't restart the
  // sequence (or double-close things that are already closing).
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info(`${signal} received, shutting down gracefully`);

  const forceExit = setTimeout(() => {
    logger.error(`Shutdown did not complete within ${SHUTDOWN_TIMEOUT_MS}ms, forcing exit`);
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref(); // never itself keeps the process alive once everything else finishes

  // Socket.IO connections are long-lived WebSockets - closing them first
  // frees them up so server.close()'s callback (which waits for every
  // open connection to finish) doesn't sit blocked on a client that's
  // just idly connected and in no hurry to disconnect on its own.
  // io.close() does NOT also close `server` here, since server was passed
  // in externally rather than created by the Socket.IO instance itself -
  // that's still this function's job below.
  getIO().close(() => {
    server.close(async () => {
      try {
        await closeSocketAdapter();
        if (redis.status !== 'end') {
          await redis.quit();
        }
        await mongoose.connection.close();
        logger.info('Shutdown complete');
        clearTimeout(forceExit);
        process.exit(exitCode);
      } catch (err) {
        logger.error(`Error during shutdown: ${err.message}`);
        clearTimeout(forceExit);
        process.exit(1);
      }
    });
  });
};

process.on('unhandledRejection', (err) => {
  logger.error(`Unhandled Rejection: ${err.message}`);
  shutdown('unhandledRejection', 1);
});

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
