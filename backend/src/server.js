import http from 'http';
import { app } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';

const server = http.createServer(app);

// Socket.IO will attach to this same `server` instance in Phase 7.

server.listen(env.PORT, () => {
  logger.info(`ChatFlow API listening on port ${env.PORT} [${env.NODE_ENV}]`);
});

process.on('unhandledRejection', (err) => {
  logger.error(`Unhandled Rejection: ${err.message}`);
  server.close(() => process.exit(1));
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => logger.info('Process terminated'));
});
