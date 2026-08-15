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

// Small helper: waits up to `ms` for an event, resolving null if it never
// fires - used to prove an event does NOT arrive (e.g. after leaving a room).
const waitForEventOrTimeout = (socket, event, ms = 300) =>
  new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    socket.once(event, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });

describe('join_conversation / leave_conversation', () => {
  it('lets a participant join and rejects a non-participant', async () => {
    const { accessToken: aliceToken } = await createTestUser({ name: 'Alice Join' });
    const { accessToken: bobToken, user: bob } = await createTestUser({ name: 'Bob Join' });
    const { accessToken: outsiderToken } = await createTestUser({ name: 'Outsider Join' });
    const conversationId = await createConversation(aliceToken, bob._id);

    const alice = await connectAndAuth(aliceToken);
    const outsider = await connectAndAuth(outsiderToken);

    const joinRes = await emitWithAck(alice, 'join_conversation', { conversationId });
    expect(joinRes.success).toBe(true);

    const rejectedRes = await emitWithAck(outsider, 'join_conversation', { conversationId });
    expect(rejectedRes.success).toBe(false);
    expect(rejectedRes.errorCode).toBe('NOT_A_PARTICIPANT');

    alice.close();
    outsider.close();
  });

  it('rejects a malformed conversationId', async () => {
    const { accessToken } = await createTestUser();
    const socket = await connectAndAuth(accessToken);

    const res = await emitWithAck(socket, 'join_conversation', { conversationId: 'not-an-id' });
    expect(res.success).toBe(false);
    expect(res.errorCode).toBe('VALIDATION_ERROR');

    socket.close();
  });
});

describe('send_message / new_message', () => {
  it('delivers new_message only to sockets that joined the room', async () => {
    const { accessToken: aliceToken } = await createTestUser({ name: 'Alice Send' });
    const { accessToken: bobToken, user: bob } = await createTestUser({ name: 'Bob Send' });
    const conversationId = await createConversation(aliceToken, bob._id);

    const alice = await connectAndAuth(aliceToken);
    const bobSocket = await connectAndAuth(bobToken);

    await emitWithAck(alice, 'join_conversation', { conversationId });
    // Bob deliberately does NOT join - he hasn't opened this chat yet.

    const bobEventPromise = waitForEventOrTimeout(bobSocket, 'new_message');
    const sendRes = await emitWithAck(alice, 'send_message', { conversationId, content: 'Hi Bob' });

    expect(sendRes.success).toBe(true);
    expect(sendRes.data.message.content).toBe('Hi Bob');
    expect(sendRes.data.created).toBe(true);

    const bobEvent = await bobEventPromise;
    expect(bobEvent).toBeNull(); // Bob hasn't joined, so no live event reaches him

    alice.close();
    bobSocket.close();
  });

  it('delivers new_message to every participant who joined, including the sender', async () => {
    const { accessToken: aliceToken } = await createTestUser({ name: 'Alice Room' });
    const { accessToken: bobToken, user: bob } = await createTestUser({ name: 'Bob Room' });
    const conversationId = await createConversation(aliceToken, bob._id);

    const alice = await connectAndAuth(aliceToken);
    const bobSocket = await connectAndAuth(bobToken);

    await emitWithAck(alice, 'join_conversation', { conversationId });
    await emitWithAck(bobSocket, 'join_conversation', { conversationId });

    const alicePromise = waitForEventOrTimeout(alice, 'new_message');
    const bobPromise = waitForEventOrTimeout(bobSocket, 'new_message');

    await emitWithAck(alice, 'send_message', { conversationId, content: 'Now Bob is listening' });

    const [aliceEvent, bobEvent] = await Promise.all([alicePromise, bobPromise]);
    expect(aliceEvent.content).toBe('Now Bob is listening');
    expect(bobEvent.content).toBe('Now Bob is listening');

    alice.close();
    bobSocket.close();
  });

  it('stops delivering events after leave_conversation', async () => {
    const { accessToken: aliceToken } = await createTestUser({ name: 'Alice Leave' });
    const { accessToken: bobToken, user: bob } = await createTestUser({ name: 'Bob Leave' });
    const conversationId = await createConversation(aliceToken, bob._id);

    const alice = await connectAndAuth(aliceToken);
    const bobSocket = await connectAndAuth(bobToken);

    await emitWithAck(alice, 'join_conversation', { conversationId });
    await emitWithAck(bobSocket, 'join_conversation', { conversationId });
    await emitWithAck(bobSocket, 'leave_conversation', { conversationId });

    const bobEventPromise = waitForEventOrTimeout(bobSocket, 'new_message');
    await emitWithAck(alice, 'send_message', { conversationId, content: 'Are you still there?' });

    expect(await bobEventPromise).toBeNull();

    alice.close();
    bobSocket.close();
  });

  it('rejects an empty payload with a validation error', async () => {
    const { accessToken: aliceToken } = await createTestUser({ name: 'Alice Bad' });
    const { user: bob } = await createTestUser({ name: 'Bob Bad' });
    const conversationId = await createConversation(aliceToken, bob._id);
    const alice = await connectAndAuth(aliceToken);

    const res = await emitWithAck(alice, 'send_message', { conversationId });
    expect(res.success).toBe(false);
    expect(res.errorCode).toBe('VALIDATION_ERROR');

    alice.close();
  });

  it('rejects sending into a conversation the socket is not part of', async () => {
    const { accessToken: aliceToken } = await createTestUser({ name: 'Alice NP' });
    const { user: bob } = await createTestUser({ name: 'Bob NP' });
    const { accessToken: outsiderToken } = await createTestUser({ name: 'Outsider NP' });
    const conversationId = await createConversation(aliceToken, bob._id);
    const outsider = await connectAndAuth(outsiderToken);

    const res = await emitWithAck(outsider, 'send_message', { conversationId, content: 'sneaky' });
    expect(res.success).toBe(false);
    expect(res.errorCode).toBe('NOT_A_PARTICIPANT');

    outsider.close();
  });

  it('rejects sending to a user who has blocked the sender', async () => {
    const { accessToken: aliceToken, user: alice } = await createTestUser({ name: 'Alice Blk' });
    const { accessToken: bobToken, user: bob } = await createTestUser({ name: 'Bob Blk' });
    const conversationId = await createConversation(aliceToken, bob._id);

    await request(app).post(`/api/users/${alice._id}/block`).set('Authorization', `Bearer ${bobToken}`);

    const aliceSocket = await connectAndAuth(aliceToken);
    const res = await emitWithAck(aliceSocket, 'send_message', { conversationId, content: 'hello?' });

    expect(res.success).toBe(false);
    expect(res.errorCode).toBe('BLOCKED');

    aliceSocket.close();
  });

  it('does not re-broadcast a retried send with the same clientMessageId', async () => {
    const { accessToken: aliceToken } = await createTestUser({ name: 'Alice Retry' });
    const { accessToken: bobToken, user: bob } = await createTestUser({ name: 'Bob Retry' });
    const conversationId = await createConversation(aliceToken, bob._id);

    const alice = await connectAndAuth(aliceToken);
    const bobSocket = await connectAndAuth(bobToken);
    await emitWithAck(alice, 'join_conversation', { conversationId });
    await emitWithAck(bobSocket, 'join_conversation', { conversationId });

    const received = [];
    bobSocket.on('new_message', (msg) => received.push(msg));

    const body = { conversationId, content: 'Once only', clientMessageId: 'socket-retry-1' };
    const first = await emitWithAck(alice, 'send_message', body);
    const retry = await emitWithAck(alice, 'send_message', body);

    expect(first.data.created).toBe(true);
    expect(retry.data.created).toBe(false);
    expect(retry.data.message._id).toBe(first.data.message._id);

    // Give any (incorrect) second broadcast a moment to arrive before asserting.
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(received).toHaveLength(1);

    alice.close();
    bobSocket.close();
  });
});
