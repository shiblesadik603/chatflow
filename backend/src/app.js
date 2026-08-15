import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { notFoundHandler, errorHandler } from './middlewares/errorHandler.js';

export const app = express();

app.use(helmet());
app.use(cors({ origin: env.CLIENT_URL, credentials: true }));
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));

const morganStream = { write: (message) => logger.info(message.trim()) };
app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev', { stream: morganStream }));

app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'ChatFlow API is running',
    timestamp: new Date().toISOString(),
  });
});

// Feature routes are mounted here in later phases, e.g.:
// app.use('/api/auth', authRoutes);

app.use(notFoundHandler);
app.use(errorHandler);
