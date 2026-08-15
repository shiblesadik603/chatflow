import http from 'http';
import { app } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { connectDB } from './config/db.js';
import { initializeSocket } from './sockets/index.js';

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

process.on('unhandledRejection', (err) => {
  logger.error(`Unhandled Rejection: ${err.message}`);
  server.close(() => process.exit(1));
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => logger.info('Process terminated'));
});
