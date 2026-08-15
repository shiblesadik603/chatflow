import http from 'http';
import request from 'supertest';
import { io as ioClient } from 'socket.io-client';
import { app } from '../src/app.js';
import { initializeSocket } from '../src/sockets/index.js';
import { Message } from '../src/models/Message.js';
import { connectTestDB, clearTestDB, disconnectTestDB } from './utils/testDb.js';
import { disconnectTestRedis } from './utils/testRedis.js';
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

const emitWithAck = (socket, event, payload) =>
  new Promise((resolve) => socket.emit(event, payload, resolve));

const createConversation = async (token, participantId) => {
  const res = await request(app)
    .post('/api/conversations')
    .set('Authorization', `Bearer ${token}`)
    .send({ participantId });
  return res.body.data.conversation._id;
};

const sendMessage = async (token, conversationId, content) => {
  const res = await request(app)
    .post(`/api/conversations/${conversationId}/messages`)
    .set('Authorization', `Bearer ${token}`)
    .send({ content });
  return res.body.data.message._id;
};

const waitForEventOrTimeout = (socket, event, ms = 400) =>
  new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    socket.once(event, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });

describe('message_delivered', () => {
  it('marks a message delivered and notifies every device of the sender', async () => {
    const { accessToken: aliceToken } = await createTestUser({ name: 'Alice Deliv' });
    const { accessToken: bobToken, user: bob } = await createTestUser({ name: 'Bob Deliv' });
    const conversationId = await createConversation(aliceToken, bob._id);
    const messageId = await sendMessage(aliceToken, conversationId, 'Hi Bob');

    const aliceSocket = await connectAndAuth(aliceToken);
    const bobSocket = await connectAndAuth(bobToken);

    const alicePromise = waitForEventOrTimeout(aliceSocket, 'message_delivered');
    const res = await emitWithAck(bobSocket, 'message_delivered', { messageId });

    expect(res.success).toBe(true);
    expect(res.data.delivered).toBe(true);

    const event = await alicePromise;
    expect(event.messageId).toBe(messageId);
    expect(event.userId).toBe(bob._id);

    const stored = await Message.findById(messageId);
    expect(stored.status).toBe('delivered');
    expect(stored.deliveredTo).toHaveLength(1);

    aliceSocket.close();
    bobSocket.close();
  });

  it('is idempotent - a duplicate delivered ack does not re-broadcast', async () => {
    const { accessToken: aliceToken } = await createTestUser({ name: 'Alice Dup' });
    const { accessToken: bobToken, user: bob } = await createTestUser({ name: 'Bob Dup' });
    const conversationId = await createConversation(aliceToken, bob._id);
    const messageId = await sendMessage(aliceToken, conversationId, 'Hi Bob');

    const aliceSocket = await connectAndAuth(aliceToken);
    const bobSocket = await connectAndAuth(bobToken);
    const events = [];
    aliceSocket.on('message_delivered', (e) => events.push(e));

    await emitWithAck(bobSocket, 'message_delivered', { messageId });
    const retry = await emitWithAck(bobSocket, 'message_delivered', { messageId });

    expect(retry.data.delivered).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(events).toHaveLength(1);

    aliceSocket.close();
    bobSocket.close();
  });

  it('no-ops when the sender marks their own message delivered', async () => {
    const { accessToken: aliceToken } = await createTestUser({ name: 'Alice Self' });
    const { user: bob } = await createTestUser({ name: 'Bob Self' });
    const conversationId = await createConversation(aliceToken, bob._id);
    const messageId = await sendMessage(aliceToken, conversationId, 'To myself?');

    const aliceSocket = await connectAndAuth(aliceToken);
    const res = await emitWithAck(aliceSocket, 'message_delivered', { messageId });

    expect(res.success).toBe(true);
    expect(res.data.delivered).toBe(false);

    aliceSocket.close();
  });

  it('rejects a non-participant and a nonexistent message', async () => {
    const { accessToken: aliceToken } = await createTestUser({ name: 'Alice Auth' });
    const { user: bob } = await createTestUser({ name: 'Bob Auth' });
    const { accessToken: outsiderToken } = await createTestUser({ name: 'Outsider Deliv' });
    const conversationId = await createConversation(aliceToken, bob._id);
    const messageId = await sendMessage(aliceToken, conversationId, 'Secret');

    const outsider = await connectAndAuth(outsiderToken);
    const forbiddenRes = await emitWithAck(outsider, 'message_delivered', { messageId });
    expect(forbiddenRes.success).toBe(false);
    expect(forbiddenRes.errorCode).toBe('NOT_A_PARTICIPANT');

    const missingRes = await emitWithAck(outsider, 'message_delivered', {
      messageId: '64f000000000000000000000',
    });
    expect(missingRes.success).toBe(false);
    expect(missingRes.errorCode).toBe('MESSAGE_NOT_FOUND');

    outsider.close();
  });
});

describe('message_read', () => {
  it('marks unread messages from others as read, in one batched event per sender', async () => {
    const { accessToken: aliceToken } = await createTestUser({ name: 'Alice Read' });
    const { accessToken: bobToken, user: bob } = await createTestUser({ name: 'Bob Read' });
    const conversationId = await createConversation(aliceToken, bob._id);

    await sendMessage(aliceToken, conversationId, 'One');
    await sendMessage(aliceToken, conversationId, 'Two');
    await sendMessage(bobToken, conversationId, 'My own message, should not count');

    const aliceSocket = await connectAndAuth(aliceToken);
    const bobSocket = await connectAndAuth(bobToken);

    const alicePromise = waitForEventOrTimeout(aliceSocket, 'message_read');
    const res = await emitWithAck(bobSocket, 'message_read', { conversationId });

    expect(res.success).toBe(true);
    expect(res.data.markedCount).toBe(2); // Bob's own message is excluded

    const event = await alicePromise;
    expect(event.messageIds).toHaveLength(2);
    expect(event.readBy).toBe(bob._id);

    aliceSocket.close();
    bobSocket.close();
  });

  it('is idempotent - reopening an already-read conversation marks nothing new', async () => {
    const { accessToken: aliceToken } = await createTestUser({ name: 'Alice Reopen' });
    const { accessToken: bobToken, user: bob } = await createTestUser({ name: 'Bob Reopen' });
    const conversationId = await createConversation(aliceToken, bob._id);
    await sendMessage(aliceToken, conversationId, 'Hello');

    const bobSocket = await connectAndAuth(bobToken);
    const first = await emitWithAck(bobSocket, 'message_read', { conversationId });
    expect(first.data.markedCount).toBe(1);

    const second = await emitWithAck(bobSocket, 'message_read', { conversationId });
    expect(second.data.markedCount).toBe(0);

    bobSocket.close();
  });

  it('rejects a non-participant', async () => {
    const { accessToken: aliceToken } = await createTestUser({ name: 'Alice ReadAuth' });
    const { user: bob } = await createTestUser({ name: 'Bob ReadAuth' });
    const { accessToken: outsiderToken } = await createTestUser({ name: 'Outsider Read' });
    const conversationId = await createConversation(aliceToken, bob._id);

    const outsider = await connectAndAuth(outsiderToken);
    const res = await emitWithAck(outsider, 'message_read', { conversationId });
    expect(res.success).toBe(false);
    expect(res.errorCode).toBe('NOT_A_PARTICIPANT');

    outsider.close();
  });

  it('does not downgrade status when delivered is marked after read (out-of-order)', async () => {
    const { accessToken: aliceToken } = await createTestUser({ name: 'Alice Order' });
    const { accessToken: bobToken, user: bob } = await createTestUser({ name: 'Bob Order' });
    const conversationId = await createConversation(aliceToken, bob._id);
    const messageId = await sendMessage(aliceToken, conversationId, 'Order test');

    const bobSocket = await connectAndAuth(bobToken);

    // Bob reads straight away, skipping an explicit "delivered" step.
    await emitWithAck(bobSocket, 'message_read', { conversationId });
    let stored = await Message.findById(messageId);
    expect(stored.status).toBe('read');

    // A late/out-of-order "delivered" ack must not revert it.
    await emitWithAck(bobSocket, 'message_delivered', { messageId });
    stored = await Message.findById(messageId);
    expect(stored.status).toBe('read');

    bobSocket.close();
  });
});
