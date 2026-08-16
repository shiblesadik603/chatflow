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
