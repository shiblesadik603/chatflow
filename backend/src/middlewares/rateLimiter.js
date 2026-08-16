import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { env } from '../config/env.js';
import { redis } from '../config/redis.js';
import { logger } from '../config/logger.js';

// Automated tests fire many register/login requests from the same IP in a
// few seconds - real rate limiting would make the test suite flaky, not the
// feature under test. `skip` is express-rate-limit's own documented hook
// for exactly this; the mechanism itself is verified separately in
// tests/rateLimiter.test.js and tests/redisRateLimiting.test.js against
// standalone limiter instances.
const skipInTests = () => env.NODE_ENV === 'test';

// Rate limiting is defense-in-depth, not the only line of defense -
// password hashing and generic auth-failure messages (Phase 3) hold
// regardless of whether this middleware runs at all. If the store errors
// (e.g. Redis is unreachable), we'd rather temporarily lose brute-force
// protection than take down login/register entirely, so this fails OPEN:
// the request proceeds as if unlimited, instead of every auth request
// turning into a 500. Exported standalone so it can be exercised directly
// against a deliberately broken store in tests, not just as a side effect
// of the real authLimiter below.
export const withFailOpen = (limiterMiddleware) => (req, res, next) => {
  limiterMiddleware(req, res, (err) => {
    if (err) {
      logger.error(`Rate limiter store error (failing open): ${err.message}`);
      return next();
    }
    next();
  });
};

// Backed by Redis, not the in-memory default store: express-rate-limit's
// built-in store only tracks hits for requests that landed on that one
// process. Run two backend instances behind a load balancer (Phase 17) and
// an attacker splitting requests across them would never trip an
// in-memory limit - the exact same problem Phase 10 solved for presence,
// here applied to rate limiting. A RedisStore makes the counter shared and
// therefore correct regardless of which instance handles which request.
const limiterWithRedisStore = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTests,
  store: new RedisStore({ sendCommand: (...args) => redis.call(...args) }),
  message: {
    success: false,
    message: 'Too many attempts, please try again later',
    errorCode: 'RATE_LIMITED',
  },
});

export const authLimiter = withFailOpen(limiterWithRedisStore);
