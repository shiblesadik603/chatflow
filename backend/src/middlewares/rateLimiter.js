import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

// Automated tests fire many register/login requests from the same IP in a
// few seconds - real rate limiting would make the test suite flaky, not the
// feature under test. `skip` is express-rate-limit's own documented hook
// for exactly this; the mechanism itself is verified separately in
// tests/rateLimiter.test.js against a standalone limiter instance.
const skipInTests = () => env.NODE_ENV === 'test';

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTests,
  message: {
    success: false,
    message: 'Too many attempts, please try again later',
    errorCode: 'RATE_LIMITED',
  },
});
