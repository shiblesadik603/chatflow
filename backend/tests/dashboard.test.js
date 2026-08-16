import http from 'http';
import request from 'supertest';
import { app } from '../src/app.js';
import { initializeSocket } from '../src/sockets/index.js';
import { connectTestDB, clearTestDB, disconnectTestDB } from './utils/testDb.js';
import { disconnectTestRedis } from './utils/testRedis.js';
import { createTestUser } from './utils/authHelpers.js';

let httpServer;

beforeAll(async () => {
  await connectTestDB();
  // One test below sends a message via REST, which broadcasts over
  // Socket.IO (Phase 8) - getIO() needs a real Server instance to exist,
  // same reasoning as messages.test.js.
  httpServer = http.createServer();
  initializeSocket(httpServer);
  await new Promise((resolve) => httpServer.listen(0, resolve));
});
afterEach(clearTestDB);
afterAll(async () => {
  await new Promise((resolve) => httpServer.close(resolve));
  await disconnectTestRedis();
  await disconnectTestDB();
});

const auth = (token) => `Bearer ${token}`;

const createPrivateConversation = (token, participantId) =>
  request(app).post('/api/conversations').set('Authorization', auth(token)).send({ participantId });

describe('GET /api/dashboard/status', () => {
  it('requires authentication', async () => {
    const res = await request(app).get('/api/dashboard/status');
    expect(res.status).toBe(401);
  });

  it('reports live dependency status and process stats', async () => {
    const { accessToken } = await createTestUser();
    const res = await request(app).get('/api/dashboard/status').set('Authorization', auth(accessToken));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const { data } = res.body;
    expect(typeof data.uptimeSeconds).toBe('number');
    expect(typeof data.nodeVersion).toBe('string');
    expect(typeof data.memory.heapUsed).toBe('number');
    // Both dependencies are genuinely connected during the test run (unlike
    // /api/health, this endpoint actually checks) - see health.test.js for
    // why app.js already opens a Redis connection just by being imported.
    expect(data.mongo.status).toBe('connected');
    expect(data.redis.status).toBe('ready');
  });

  it('reflects real counts, not hardcoded placeholders', async () => {
    const { accessToken: aliceToken } = await createTestUser({ name: 'Dash Alice' });
    const { accessToken: bobToken, user: bob } = await createTestUser({ name: 'Dash Bob' });
    const createRes = await createPrivateConversation(aliceToken, bob._id);
    const conversationId = createRes.body.data.conversation._id;

    const before = await request(app).get('/api/dashboard/status').set('Authorization', auth(aliceToken));
    expect(before.body.data.counts.totalUsers).toBe(2);
    expect(before.body.data.counts.totalConversations).toBe(1);
    expect(before.body.data.counts.totalMessages).toBe(0);

    const sendRes = await request(app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', auth(aliceToken))
      .send({ content: 'counted?' });
    expect(sendRes.status).toBe(201);

    const after = await request(app).get('/api/dashboard/status').set('Authorization', auth(bobToken));
    expect(after.body.data.counts.totalMessages).toBe(1);
  });
});

describe('POST /api/dashboard/simulate/redis-down and redis-restore', () => {
  it('really disconnects and reconnects the app\'s shared Redis client', async () => {
    const { accessToken, user } = await createTestUser({ name: 'Sim User' });

    const downRes = await request(app)
      .post('/api/dashboard/simulate/redis-down')
      .set('Authorization', auth(accessToken));
    expect(downRes.status).toBe(200);
    expect(downRes.body.data.status).not.toBe('ready');

    try {
      // The dashboard's own status check must survive Redis being down
      // (that's the entire point) and report the real degraded state, not
      // crash or lie about it.
      const statusDuringOutage = await request(app)
        .get('/api/dashboard/status')
        .set('Authorization', auth(accessToken));
      expect(statusDuringOutage.status).toBe(200);
      expect(statusDuringOutage.body.data.redis.status).not.toBe('ready');
      expect(statusDuringOutage.body.data.mongo.status).toBe('connected');

      // Same real degradation proven with jest.spyOn in userCache.test.js -
      // here it's the actual disconnected client, not a mocked single call.
      // getUserById falls back to Mongo and still succeeds.
      const profileRes = await request(app)
        .get(`/api/users/${user._id}`)
        .set('Authorization', auth(accessToken));
      expect(profileRes.status).toBe(200);
      expect(profileRes.body.data.user.name).toBe('Sim User');
    } finally {
      // Always restore, even if an assertion above throws - this file's
      // afterAll calls redis.quit(), which needs a live connection, and a
      // failed assertion here shouldn't leave every later test in this
      // file (or the teardown itself) running against a dead client.
      const restoreRes = await request(app)
        .post('/api/dashboard/simulate/redis-restore')
        .set('Authorization', auth(accessToken));
      expect(restoreRes.status).toBe(200);
      expect(restoreRes.body.data.status).toBe('ready');
    }
  });

  it('restoring when already connected is a safe no-op', async () => {
    const { accessToken } = await createTestUser();
    const res = await request(app)
      .post('/api/dashboard/simulate/redis-restore')
      .set('Authorization', auth(accessToken));
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ready');
  });

  it('requires authentication', async () => {
    const downRes = await request(app).post('/api/dashboard/simulate/redis-down');
    expect(downRes.status).toBe(401);
    const restoreRes = await request(app).post('/api/dashboard/simulate/redis-restore');
    expect(restoreRes.status).toBe(401);
  });
});
