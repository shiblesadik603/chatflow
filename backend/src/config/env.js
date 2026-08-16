import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5001),
  CLIENT_URL: z.string().url().default('http://localhost:5173'),
  MONGO_URI: z.string().min(1, 'MONGO_URI is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET should be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('15m'),
  REFRESH_TOKEN_SECRET: z.string().min(32, 'REFRESH_TOKEN_SECRET should be at least 32 characters'),
  REFRESH_TOKEN_EXPIRES_IN: z.string().default('30d'),
  REDIS_URL: z.string().default('redis://127.0.0.1:6379'),
  // Base URL this server is reachable at - used to build absolute URLs for
  // uploaded files (e.g. http://localhost:5001/uploads/<file>). In
  // production this would be the real API domain.
  PUBLIC_URL: z.string().url().default('http://localhost:5001'),
  UPLOAD_DIR: z.string().default('uploads'),
  // All three optional, and all-or-nothing in practice (storageService.js
  // only switches to Cloudinary when CLOUDINARY_CLOUD_NAME is set) - local
  // dev keeps working against disk with zero Cloudinary account needed;
  // a real deployment (Render, etc.) sets these and gets a shared,
  // CDN-backed store that survives redeploys instead of an ephemeral
  // filesystem.
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  // Number of reverse-proxy hops to trust for req.ip (see app.js). 0 = no
  // proxy, use the raw connection address - correct for local dev.
  TRUST_PROXY: z.coerce.number().int().nonnegative().default(0),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
