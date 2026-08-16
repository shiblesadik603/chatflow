import http from 'http';
import request from 'supertest';
import { io as ioClient } from 'socket.io-client';
import { app } from '../src/app.js';
import { initializeSocket } from '../src/sockets/index.js';
import { connectTestDB, clearTestDB, disconnectTestDB } from './utils/testDb.js';
import { clearTestRedis, disconnectTestRedis } from './utils/testRedis.js';
import { createTestUser } from './utils/authHelpers.js';

let httpServer;
let port;

beforeAll(async () => {
  await connectTestDB();
  httpServer = http.createServer(app);
  initializeSocket(httpServer);
  await new Promise((resolve) => {
    httpServer.listen(0, () => {
      port = httpServer.address().port;
      resolve();
    });
  });
});

afterEach(async () => {
  // A brief settle window: a test's socket.close() calls trigger the
  // server's async 'disconnect' handler (which now includes a Redis call
  // via presenceHandlers.js), but nothing in the test awaits that
  // handler's completion. Tearing down Redis while it's still in flight
  // throws "Connection is closed" as an unhandled rejection.
  await new Promise((resolve) => setTimeout(resolve, 200));
  await clearTestDB();
  await clearTestRedis();
});

afterAll(async () => {
  await new Promise((resolve) => httpServer.close(resolve));
  await disconnectTestRedis();
  await disconnectTestDB();
});

const connectAndAuth = (token) =>
  new Promise((resolve, reject) => {
    const socket = ioClient(`http://localhost:${port}`, {
      auth: { token },
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
    });
    socket.once('authenticated', () => resolve(socket));
    socket.once('connect_error', reject);
  });

const createConversation = async (token, participantId) => {
  const res = await request(app)
    .post('/api/conversations')
    .set('Authorization', `Bearer ${token}`)
    .send({ participantId });
  return res.body.data.conversation._id;
};

const waitForEventOrTimeout = (socket, event, ms = 400) =>
  new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    socket.once(event, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });

const collectEvents = (socket, event) => {
  const received = [];
  socket.on(event, (data) => received.push(data));
  return received;
};

describe('presence: online / offline', () => {
  it('notifies contacts when a user comes online, but not unrelated users', async () => {
    const { accessToken: aliceToken, user: alice } = await createTestUser({ name: 'Alice Presence' });
    const { accessToken: bobToken, user: bob } = await createTestUser({ name: 'Bob Presence' });
    const { accessToken: carolToken } = await createTestUser({ name: 'Carol Presence' });
    await createConversation(aliceToken, bob._id); // Bob is Alice's contact; Carol is not

    const bobSocket = await connectAndAuth(bobToken);
    const carolSocket = await connectAndAuth(carolToken);

    const bobPromise = waitForEventOrTimeout(bobSocket, 'user_online');
    const carolPromise = waitForEventOrTimeout(carolSocket, 'user_online');

    const aliceSocket = await connectAndAuth(aliceToken);

    expect(await bobPromise).toEqual({ userId: alice._id });
    expect(await carolPromise).toBeNull();

    const profileRes = await request(app)
      .get(`/api/users/${alice._id}`)
      .set('Authorization', `Bearer ${bobToken}`);
    expect(profileRes.body.data.user.isOnline).toBe(true);

    aliceSocket.close();
    bobSocket.close();
    carolSocket.close();
  });

  it('stays online across multiple devices and only goes offline once every socket disconnects', async () => {
    const { accessToken: aliceToken, user: alice } = await createTestUser({ name: 'Alice Multi' });
    const { accessToken: bobToken, user: bob } = await createTestUser({ name: 'Bob Multi' });
    await createConversation(aliceToken, bob._id);

    const bobSocket = await connectAndAuth(bobToken);
    // Attached before either of Alice's connections exist, not after -
    // Socket.IO doesn't buffer a custom event for a listener that gets
    // attached later. If aliceSocketA's user_online broadcast is sent (and
    // possibly arrives) before this listener exists, it's silently lost,
    // not queued.
    const onlineEvents = collectEvents(bobSocket, 'user_online');
    const offlineEvents = collectEvents(bobSocket, 'user_offline');

    const aliceSocketA = await connectAndAuth(aliceToken);
    const aliceSocketB = await connectAndAuth(aliceToken);

    // try/finally: if an assertion below throws, these sockets must still
    // close - an assertion failure leaving a connection open once hung
    // afterAll's httpServer.close() for the entire file (it waits for
    // existing connections to end).
    try {
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(onlineEvents).toHaveLength(1); // only the first connection triggers a broadcast
      expect(onlineEvents[0]).toEqual({ userId: alice._id });

      // Close one of the two - Alice should still be considered online.
      aliceSocketA.close();
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(offlineEvents).toHaveLength(0);

      const stillOnlineRes = await request(app)
        .get(`/api/users/${alice._id}`)
        .set('Authorization', `Bearer ${bobToken}`);
      expect(stillOnlineRes.body.data.user.isOnline).toBe(true);

      // Close the last remaining socket - now Alice actually goes offline.
      aliceSocketB.close();
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(offlineEvents).toHaveLength(1);
      expect(offlineEvents[0].userId).toBe(alice._id);

      const offlineRes = await request(app)
        .get(`/api/users/${alice._id}`)
        .set('Authorization', `Bearer ${bobToken}`);
      expect(offlineRes.body.data.user.isOnline).toBe(false);
      expect(new Date(offlineRes.body.data.user.lastSeen).getTime()).toBeGreaterThan(Date.now() - 5000);
    } finally {
      bobSocket.close();
      aliceSocketA.close();
      aliceSocketB.close();
    }
  });
});
