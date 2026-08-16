import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import mongoSanitize from 'express-mongo-sanitize';
import './models/index.js';
import { env } from './config/env.js';
import { corsOptions } from './config/cors.js';
import { logger } from './config/logger.js';
import { notFoundHandler, errorHandler } from './middlewares/errorHandler.js';
import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import conversationRoutes from './routes/conversationRoutes.js';
import messageRoutes from './routes/messageRoutes.js';
import groupRoutes from './routes/groupRoutes.js';
import uploadRoutes from './routes/uploadRoutes.js';
import { UPLOAD_DIR } from './services/storageService.js';

export const app = express();

// Only meaningful behind a real reverse proxy / load balancer: it tells
// Express how many hops of X-Forwarded-For to trust when computing
// req.ip. express-rate-limit (Phase 3/16) keys its counters by req.ip -
// get this wrong in either direction and rate limiting breaks. Too low
// (or unset, the default) behind a real proxy: every request appears to
// come from the proxy's own IP, so every client shares one bucket. Too
// high (or blindly trusting every hop) with no real proxy in front: a
// client can set their own X-Forwarded-For header and claim to be any IP
// they like, bypassing the limit entirely. Defaults to 0 (trust nothing,
// always use the raw socket address) - correct for local dev, where
// there's no proxy at all. Phase 24/25 set this to the actual number of
// hops once the real deployment topology (Docker, a reverse proxy, etc.)
// is decided.
if (env.TRUST_PROXY > 0) {
  app.set('trust proxy', env.TRUST_PROXY);
}

app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Strips any request key starting with "$" or containing "." from
// body/query/params - the classic NoSQL injection shape, e.g. sending
// {"email": {"$ne": null}} to try to bypass a Mongo query. Zod already
// blocks this for every field we validate (z.string() rejects an object
// outright), so this is defense-in-depth for anything we forget to
// validate, not the primary defense.
app.use(mongoSanitize());

const morganStream = { write: (message) => logger.info(message.trim()) };
app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev', { stream: morganStream }));

app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'ChatFlow API is running',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/uploads', uploadRoutes);

// Serves uploaded files back out. Helmet's default
// Cross-Origin-Resource-Policy: same-origin would otherwise block the
// frontend (a different origin in dev) from displaying these in an <img>
// tag - that's a separate browser mechanism from CORS, not covered by the
// cors() middleware above.
app.use(
  '/uploads',
  express.static(UPLOAD_DIR, {
    setHeaders: (res) => res.set('Cross-Origin-Resource-Policy', 'cross-origin'),
  })
);

// More feature routes are mounted here in later phases.

app.use(notFoundHandler);
app.use(errorHandler);
