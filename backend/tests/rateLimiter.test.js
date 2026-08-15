import express from 'express';
import request from 'supertest';
import rateLimit from 'express-rate-limit';

// The real authLimiter is skipped in NODE_ENV=test (see rateLimiter.js) so
// the rest of the suite can make many requests without tripping it. This
// test proves the underlying mechanism itself works, using a standalone
// app with its own tiny limit - fully independent of that skip logic.
describe('rate limiter mechanism', () => {
  it('blocks a client after it exceeds the configured limit', async () => {
    const app = express();
    app.use(
      rateLimit({
        windowMs: 60_000,
        limit: 2,
        standardHeaders: true,
        legacyHeaders: false,
        message: { success: false, message: 'Too many attempts', errorCode: 'RATE_LIMITED' },
      })
    );
    app.get('/ping', (req, res) => res.json({ ok: true }));

    await request(app).get('/ping').expect(200);
    await request(app).get('/ping').expect(200);

    const blocked = await request(app).get('/ping');
    expect(blocked.status).toBe(429);
    expect(blocked.body.errorCode).toBe('RATE_LIMITED');
  });
});
