import http from 'http';
import request from 'supertest';
import { io as ioClient } from 'socket.io-client';
import { app } from '../src/app.js';
import { initializeSocket } from '../src/sockets/index.js';
import { connectTestDB, clearTestDB, disconnectTestDB } from './utils/testDb.js';
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

afterEach(clearTestDB);

afterAll(async () => {
  await new Promise((resolve) => httpServer.close(resolve));
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

const emitWithAck = (socket, event, payload) =>
  new Promise((resolve) => socket.emit(event, payload, resolve));

const createConversation = async (token, participantId) => {
  const res = await request(app)
    .post('/api/conversations')
    .set('Authorization', `Bearer ${token}`)
    .send({ participantId });
  return res.body.data.conversation._id;
};

const waitForEventOrTimeout = (socket, event, ms = 300) =>
  new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    socket.once(event, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });

describe('typing_start / typing_stop', () => {
  it('relays typing_start to other room members but not back to the sender', async () => {
    const { accessToken: aliceToken, user: alice } = await createTestUser({ name: 'Alice Type' });
    const { accessToken: bobToken, user: bob } = await createTestUser({ name: 'Bob Type' });
    const conversationId = await createConversation(aliceToken, bob._id);

    const aliceSocket = await connectAndAuth(aliceToken);
    const bobSocket = await connectAndAuth(bobToken);
    await emitWithAck(aliceSocket, 'join_conversation', { conversationId });
    await emitWithAck(bobSocket, 'join_conversation', { conversationId });

    const bobPromise = waitForEventOrTimeout(bobSocket, 'typing_start');
    const aliceSelfPromise = waitForEventOrTimeout(aliceSocket, 'typing_start');

    aliceSocket.emit('typing_start', { conversationId });

    const bobEvent = await bobPromise;
    expect(bobEvent).toEqual({ conversationId, userId: alice._id });

    const aliceSelfEvent = await aliceSelfPromise;
    expect(aliceSelfEvent).toBeNull(); // sender never receives its own typing event

    aliceSocket.close();
    bobSocket.close();
  });

  it('relays typing_stop the same way', async () => {
    const { accessToken: aliceToken, user: alice } = await createTestUser({ name: 'Alice Stop' });
    const { accessToken: bobToken, user: bob } = await createTestUser({ name: 'Bob Stop' });
    const conversationId = await createConversation(aliceToken, bob._id);

    const aliceSocket = await connectAndAuth(aliceToken);
    const bobSocket = await connectAndAuth(bobToken);
    await emitWithAck(aliceSocket, 'join_conversation', { conversationId });
    await emitWithAck(bobSocket, 'join_conversation', { conversationId });

    const bobPromise = waitForEventOrTimeout(bobSocket, 'typing_stop');
    aliceSocket.emit('typing_stop', { conversationId });

    expect(await bobPromise).toEqual({ conversationId, userId: alice._id });

    aliceSocket.close();
    bobSocket.close();
  });

  it('drops the event if the sender has not joined the conversation room', async () => {
    const { accessToken: aliceToken } = await createTestUser({ name: 'Alice NoJoin' });
    const { accessToken: bobToken, user: bob } = await createTestUser({ name: 'Bob NoJoin' });
    const conversationId = await createConversation(aliceToken, bob._id);

    const aliceSocket = await connectAndAuth(aliceToken);
    const bobSocket = await connectAndAuth(bobToken);
    await emitWithAck(bobSocket, 'join_conversation', { conversationId });
    // Alice never joins - e.g. she hasn't opened this chat thread.

    const bobPromise = waitForEventOrTimeout(bobSocket, 'typing_start');
    aliceSocket.emit('typing_start', { conversationId });

    expect(await bobPromise).toBeNull();

    aliceSocket.close();
    bobSocket.close();
  });

  it('does not crash on a malformed payload', async () => {
    const { accessToken } = await createTestUser();
    const socket = await connectAndAuth(accessToken);

    // No ack channel for typing events - just confirm the connection
    // survives sending garbage and the socket is still usable afterward.
    socket.emit('typing_start', { conversationId: 'not-an-id' });
    socket.emit('typing_start', null);

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(socket.connected).toBe(true);

    socket.close();
  });
});
