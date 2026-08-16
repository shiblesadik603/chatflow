import express from 'express';
import request from 'supertest';
import mongoSanitize from 'express-mongo-sanitize';
import { app } from '../src/app.js';
import { User } from '../src/models/User.js';
import { connectTestDB, clearTestDB, disconnectTestDB } from './utils/testDb.js';
import { disconnectTestRedis } from './utils/testRedis.js';
import { createTestUser } from './utils/authHelpers.js';

beforeAll(connectTestDB);
afterEach(clearTestDB);
afterAll(async () => {
  await disconnectTestRedis();
  await disconnectTestDB();
});

const auth = (token) => `Bearer ${token}`;

describe('mass-assignment protection', () => {
  it('ignores fields not in the update schema (e.g. trying to grant admin via extra JSON keys)', async () => {
    const { accessToken, user } = await createTestUser();

    const res = await request(app)
      .patch('/api/users/me')
      .set('Authorization', auth(accessToken))
      .send({ name: 'Legit Update', isAdmin: true, role: 'admin', _id: '64f000000000000000000000' });

    expect(res.status).toBe(200);
    expect(res.body.data.user.name).toBe('Legit Update');
    expect(res.body.data.user.isAdmin).toBeUndefined();
    expect(res.body.data.user.role).toBeUndefined();

    // Confirm it wasn't just stripped from the response - it was never
    // written to the database at all.
    const stored = await User.findById(user._id);
    expect(stored.toObject().isAdmin).toBeUndefined();
    expect(stored.toObject().role).toBeUndefined();
    expect(stored._id.toString()).toBe(user._id);
  });
});

describe('NoSQL injection protection', () => {
  it('Zod rejects an injection-shaped login body before it ever reaches a query', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: { $gt: '' }, password: { $gt: '' } });

    // z.string() rejects a non-string value outright - the object never
    // survives validation to become part of a Mongo query.
    expect(res.status).toBe(422);
    expect(res.body.errorCode).toBe('VALIDATION_ERROR');
  });

  it('mongoSanitize strips $-prefixed and dotted keys as a defense-in-depth layer, independent of Zod', async () => {
    // An isolated mechanism test (same style as rateLimiter.test.js) -
    // proves the middleware itself works, not just that Zod happens to
    // also catch this particular shape for our specific routes.
    const testApp = express();
    testApp.use(express.json());
    testApp.use(mongoSanitize());
    testApp.post('/echo', (req, res) => res.json(req.body));

    const res = await request(testApp)
      .post('/echo')
      .send({ email: { $gt: '' }, 'nested.field': 'x', normalField: 'kept' });

    expect(res.body.email).toEqual({}); // $gt key stripped
    expect(res.body['nested.field']).toBeUndefined(); // dotted key stripped
    expect(res.body.normalField).toBe('kept'); // ordinary fields pass through untouched
  });
});

describe('sensitive data is never logged', () => {
  it('never writes the raw password, access token, or refresh token to stdout', async () => {
    const capturedOutput = [];
    const originalStdoutWrite = process.stdout.write.bind(process.stdout);
    const originalConsoleLog = console.log;

    process.stdout.write = (chunk, ...rest) => {
      capturedOutput.push(String(chunk));
      return originalStdoutWrite(chunk, ...rest);
    };
    console.log = (...args) => {
      capturedOutput.push(args.map(String).join(' '));
      originalConsoleLog(...args);
    };

    try {
      const password = 'SuperSecretPassword123!';
      const registerRes = await request(app)
        .post('/api/auth/register')
        .send({ name: 'Log Audit', email: 'log.audit@example.com', password });

      const { accessToken } = registerRes.body.data;
      const refreshCookie = registerRes.headers['set-cookie'][0];
      const refreshTokenValue = refreshCookie.split('refreshToken=')[1].split(';')[0];

      await request(app).post('/api/auth/login').send({ email: 'log.audit@example.com', password });
      await request(app).get('/api/auth/me').set('Authorization', `Bearer ${accessToken}`);
      await request(app).post('/api/auth/refresh').set('Cookie', refreshCookie);

      const allOutput = capturedOutput.join('\n');
      expect(allOutput).not.toContain(password);
      expect(allOutput).not.toContain(accessToken);
      expect(allOutput).not.toContain(refreshTokenValue);
    } finally {
      process.stdout.write = originalStdoutWrite;
      console.log = originalConsoleLog;
    }
  });
});
