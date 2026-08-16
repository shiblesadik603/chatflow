import express from 'express';
import request from 'supertest';
import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import Redis from 'ioredis';
import { env } from '../src/config/env.js';
import { withFailOpen } from '../src/middlewares/rateLimiter.js';

// A dedicated Redis client for this file, deliberately not the app's
// shared singleton (config/redis.js) - this file doesn't touch Mongo or
// any other app machinery, so it's simpler and safer to own a fully
// independent connection it can freely quit without any risk of a
// lingering/broken connection's retry timers affecting other test files.
const testRedis = new Redis(env.REDIS_URL);

afterAll(async () => {
  await testRedis.quit();
});

// Note on `--forceExit` (package.json's test script): this file's exact
// logic - creating this client, two RedisStore instances sharing it, a
// third store with a rejecting sendCommand, calling client.quit() - runs
// and exits cleanly as plain Node with no Jest involved at all, verified
// by copying it out into a standalone script. It only hangs on exit when
// run under Jest with --experimental-vm-modules, including when this file
// runs completely alone. That's strong evidence this is a Jest/ioredis
// test-environment interaction, not a real unclosed handle in the code
// here - forceExit is a deliberate, verified choice for this file, not a
// blind workaround for an unexplained leak.

const buildApp = (limiter) => {
  const app = express();
  app.use(limiter);
  app.get('/ping', (req, res) => res.json({ ok: true }));
  return app;
};

describe('Redis-backed rate limiting is shared across instances', () => {
  it('a limit reached on one "instance" also blocks a separate instance sharing the same Redis store', async () => {
    // Two independent limiter instances - standing in for two separate
    // backend processes - both pointed at the same Redis, using a unique
    // key prefix so this test can't collide with any other test's data.
    const keyPrefix = `test-cross-instance-${Date.now()}:`;
    const makeLimiter = () =>
      rateLimit({
        windowMs: 60_000,
        limit: 2,
        standardHeaders: true,
        legacyHeaders: false,
        store: new RedisStore({ prefix: keyPrefix, sendCommand: (...args) => testRedis.call(...args) }),
      });

    const instanceA = buildApp(makeLimiter());
    const instanceB = buildApp(makeLimiter());

    await request(instanceA).get('/ping').expect(200);
    await request(instanceA).get('/ping').expect(200);
    await request(instanceA).get('/ping').expect(429); // instance A's own limit is reached

    // Instance B has never seen a request before, but shares the same
    // Redis-backed counter - it's already at the limit too.
    await request(instanceB).get('/ping').expect(429);
  });

  it('contrast: the default in-memory store is NOT shared across instances (the problem Redis solves)', async () => {
    const makeLimiter = () => rateLimit({ windowMs: 60_000, limit: 2 }); // no store = in-memory default

    const instanceA = buildApp(makeLimiter());
    const instanceB = buildApp(makeLimiter());

    await request(instanceA).get('/ping').expect(200);
    await request(instanceA).get('/ping').expect(200);
    await request(instanceA).get('/ping').expect(429);

    // Instance B has its own, separate in-memory counter - completely
    // unaffected by instance A having already hit its limit. This is
    // exactly what an attacker splitting requests across real backend
    // instances behind a load balancer would exploit.
    await request(instanceB).get('/ping').expect(200);
  });
});

describe('rate limiter fails open when its store errors', () => {
  it('lets requests through instead of 500ing when the store errors', async () => {
    // No real network connection here on purpose: a genuinely broken
    // ioredis client (pointed at an unreachable host) brings its own
    // internal reconnection/timer behavior that's finicky to fully quiesce
    // in a test - not what this test is actually about. What matters is
    // just "does withFailOpen correctly handle a rejecting store," so
    // sendCommand rejects directly. The real "Redis is genuinely down"
    // scenario is proven live in Phase 10 (the server was manually
    // stopped and the app kept working); this test isolates the fail-open
    // mechanism itself.
    const brokenLimiter = rateLimit({
      windowMs: 60_000,
      limit: 2,
      store: new RedisStore({ sendCommand: () => Promise.reject(new Error('simulated Redis failure')) }),
    });

    const app = buildApp(withFailOpen(brokenLimiter));

    // Every request should succeed despite the store being completely
    // broken - including well past what the configured limit would allow,
    // proving this isn't coincidentally passing because of the limit
    // itself.
    await request(app).get('/ping').expect(200);
    await request(app).get('/ping').expect(200);
    await request(app).get('/ping').expect(200);
    await request(app).get('/ping').expect(200);
  });
});
