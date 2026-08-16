import http from 'http';
import { Server } from 'socket.io';
import request from 'supertest';
import { io as ioClient } from 'socket.io-client';
import { app } from '../src/app.js';
import { initializeSocket } from '../src/sockets/index.js';
import { socketAuth } from '../src/sockets/socketAuth.js';
import { connectTestDB, clearTestDB, disconnectTestDB } from './utils/testDb.js';
import { clearTestRedis, disconnectTestRedis } from './utils/testRedis.js';
import { createTestUser } from './utils/authHelpers.js';

beforeAll(connectTestDB);
afterEach(clearTestDB);
afterAll(async () => {
  await disconnectTestRedis();
  await disconnectTestDB();
});

const createConversation = async (token, participantId) => {
  const res = await request(app)
    .post('/api/conversations')
    .set('Authorization', `Bearer ${token}`)
    .send({ participantId });
  return res.body.data.conversation._id;
};

const listen = () =>
  new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, () => resolve(server));
  });

const connectAndAuth = (port, token) =>
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

const emitWithAck = (socket, event, payload) =>
  new Promise((resolve) => socket.emit(event, payload, resolve));

const waitForEvent = (socket, event, ms = 1000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), ms);
    socket.once(event, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });

const waitForEventOrTimeout = (socket, event, ms = 500) =>
  new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    socket.once(event, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });

describe('Redis adapter: cross-instance delivery', () => {
  afterEach(clearTestRedis);

  it('delivers a message sent on one Socket.IO instance to a socket connected to a different instance', async () => {
    // Two fully separate HTTP servers, each with its own initializeSocket()
    // call - two independent Server objects, standing in for two separate
    // backend processes, both wired to the same Redis for the adapter.
    const httpServerA = await listen();
    const httpServerB = await listen();
    initializeSocket(httpServerA);
    initializeSocket(httpServerB);
    const portA = httpServerA.address().port;
    const portB = httpServerB.address().port;

    try {
      const { accessToken: aliceToken } = await createTestUser({ name: 'Alice InstanceA' });
      const { accessToken: bobToken, user: bob } = await createTestUser({ name: 'Bob InstanceB' });
      const conversationId = await createConversation(aliceToken, bob._id);

      // Alice connects to instance A, Bob connects to instance B.
      const aliceSocket = await connectAndAuth(portA, aliceToken);
      const bobSocket = await connectAndAuth(portB, bobToken);

      await emitWithAck(aliceSocket, 'join_conversation', { conversationId });
      await emitWithAck(bobSocket, 'join_conversation', { conversationId });

      const bobEventPromise = waitForEvent(bobSocket, 'new_message');

      // Sent on instance A's connection - handled by instance A's
      // messageHandlers.js, which calls (instance A's) io.to(conversationId)
      // .emit(...). Without the adapter, instance A has no idea Bob's
      // socket - connected to instance B - even exists.
      await emitWithAck(aliceSocket, 'send_message', { conversationId, content: 'Reaching across instances' });

      const bobEvent = await bobEventPromise;
      expect(bobEvent.content).toBe('Reaching across instances');

      aliceSocket.close();
      bobSocket.close();
    } finally {
      await new Promise((resolve) => httpServerA.close(resolve));
      await new Promise((resolve) => httpServerB.close(resolve));
    }
  });
});

describe('contrast: without the adapter, cross-instance delivery silently fails', () => {
  it('a plain Socket.IO server with no adapter never reaches a socket on a different instance', async () => {
    // Deliberately bare - no createAdapter(), no app.js, no message
    // handlers - just enough Socket.IO to demonstrate the exact mechanism
    // the adapter fixes: io.to(room).emit() only reaching sockets known to
    // *this* process's in-memory room registry.
    const httpServerA = http.createServer();
    const httpServerB = http.createServer();
    const ioA = new Server(httpServerA);
    const ioB = new Server(httpServerB);
    [ioA, ioB].forEach((io) => {
      io.use(socketAuth);
      io.on('connection', (socket) => {
        socket.join('shared-room');
        socket.emit('authenticated', {});
      });
    });

    await new Promise((resolve) => httpServerA.listen(0, resolve));
    await new Promise((resolve) => httpServerB.listen(0, resolve));
    const portA = httpServerA.address().port;
    const portB = httpServerB.address().port;

    try {
      const { accessToken: aliceToken } = await createTestUser({ name: 'Alice NoAdapter' });
      const { accessToken: bobToken } = await createTestUser({ name: 'Bob NoAdapter' });

      const aliceSocket = await connectAndAuth(portA, aliceToken);
      const bobSocket = await connectAndAuth(portB, bobToken);

      const bobEventPromise = waitForEventOrTimeout(bobSocket, 'ping_from_a');

      // Broadcast from instance A's io object, targeting the room Bob's
      // socket (on instance B) already joined.
      ioA.to('shared-room').emit('ping_from_a', { hello: 'world' });

      expect(await bobEventPromise).toBeNull(); // never arrives - no adapter to relay it

      aliceSocket.close();
      bobSocket.close();
    } finally {
      ioA.close();
      ioB.close();
    }
  });
});
