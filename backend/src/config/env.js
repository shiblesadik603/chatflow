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
