import http from 'http';
import request from 'supertest';
import { io as ioClient } from 'socket.io-client';
import { app } from '../src/app.js';
import { initializeSocket } from '../src/sockets/index.js';
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

const waitForEvent = (socket, event, ms = 500) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), ms);
    socket.once(event, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });

describe('REST message creation broadcasting over Socket.IO', () => {
  // Regression test: POST /api/conversations/:id/messages originally only
  // broadcast new_message when sent through the socket's send_message
  // event (Phase 8) - the plain REST path silently never announced a new
  // message to anyone else's live connection. Caught manually while
  // testing voice messages (Phase 15) sent over REST, not sockets.
  it('broadcasts new_message when a message is created over plain REST, not just via the socket event', async () => {
    const { accessToken: aliceToken } = await createTestUser({ name: 'Alice RestSend' });
    const { accessToken: bobToken, user: bob } = await createTestUser({ name: 'Bob RestSend' });
    const conversationId = await createConversation(aliceToken, bob._id);

    const aliceSocket = await connectAndAuth(aliceToken);
    const bobSocket = await connectAndAuth(bobToken);
    await emitWithAck(aliceSocket, 'join_conversation', { conversationId });
    await emitWithAck(bobSocket, 'join_conversation', { conversationId });

    const bobEventPromise = waitForEvent(bobSocket, 'new_message');

    const res = await request(app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ content: 'Sent over plain REST, not send_message' });
    expect(res.status).toBe(201);

    const bobEvent = await bobEventPromise;
    expect(bobEvent.content).toBe('Sent over plain REST, not send_message');

    aliceSocket.close();
    bobSocket.close();
  });

  it('does not re-broadcast a REST idempotent retry with the same clientMessageId', async () => {
    const { accessToken: aliceToken } = await createTestUser({ name: 'Alice RestRetry' });
    const { accessToken: bobToken, user: bob } = await createTestUser({ name: 'Bob RestRetry' });
    const conversationId = await createConversation(aliceToken, bob._id);

    const bobSocket = await connectAndAuth(bobToken);
    await emitWithAck(bobSocket, 'join_conversation', { conversationId });
    const received = [];
    bobSocket.on('new_message', (msg) => received.push(msg));

    const body = { content: 'Once only', clientMessageId: 'rest-retry-1' };
    await request(app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send(body);
    await request(app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send(body);

    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(received).toHaveLength(1);

    bobSocket.close();
  });
});

describe('REST edit/delete broadcasting over Socket.IO', () => {
  it('broadcasts message_edited to everyone in the conversation room', async () => {
    const { accessToken: aliceToken } = await createTestUser({ name: 'Alice Broadcast' });
    const { accessToken: bobToken, user: bob } = await createTestUser({ name: 'Bob Broadcast' });
    const conversationId = await createConversation(aliceToken, bob._id);
    const messageId = await sendMessage(aliceToken, conversationId, 'Original text');

    const aliceSocket = await connectAndAuth(aliceToken);
    const bobSocket = await connectAndAuth(bobToken);
    await emitWithAck(aliceSocket, 'join_conversation', { conversationId });
    await emitWithAck(bobSocket, 'join_conversation', { conversationId });

    const bobEventPromise = waitForEvent(bobSocket, 'message_edited');

    const editRes = await request(app)
      .patch(`/api/messages/${messageId}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ content: 'Edited text' });
    expect(editRes.status).toBe(200);

    const bobEvent = await bobEventPromise;
    expect(bobEvent._id).toBe(messageId);
    expect(bobEvent.content).toBe('Edited text');
    expect(bobEvent.isEdited).toBe(true);

    aliceSocket.close();
    bobSocket.close();
  });

  it('broadcasts message_deleted with a minimal payload to everyone in the room', async () => {
    const { accessToken: aliceToken } = await createTestUser({ name: 'Alice DelBroadcast' });
    const { accessToken: bobToken, user: bob } = await createTestUser({ name: 'Bob DelBroadcast' });
    const conversationId = await createConversation(aliceToken, bob._id);
    const messageId = await sendMessage(aliceToken, conversationId, 'Will be deleted');

    const aliceSocket = await connectAndAuth(aliceToken);
    const bobSocket = await connectAndAuth(bobToken);
    await emitWithAck(aliceSocket, 'join_conversation', { conversationId });
    await emitWithAck(bobSocket, 'join_conversation', { conversationId });

    const bobEventPromise = waitForEvent(bobSocket, 'message_deleted');

    const deleteRes = await request(app)
      .delete(`/api/messages/${messageId}`)
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(deleteRes.status).toBe(200);

    const bobEvent = await bobEventPromise;
    expect(bobEvent.messageId).toBe(messageId);
    expect(bobEvent.conversationId).toBe(conversationId);
    expect(Object.keys(bobEvent).sort()).toEqual(['conversationId', 'deletedAt', 'messageId']);
    expect(new Date(bobEvent.deletedAt).getTime()).toBeGreaterThan(Date.now() - 5000);

    aliceSocket.close();
    bobSocket.close();
  });

  it('does not broadcast to sockets that never joined the conversation room', async () => {
    const { accessToken: aliceToken } = await createTestUser({ name: 'Alice NoJoinEdit' });
    const { accessToken: bobToken, user: bob } = await createTestUser({ name: 'Bob NoJoinEdit' });
    const conversationId = await createConversation(aliceToken, bob._id);
    const messageId = await sendMessage(aliceToken, conversationId, 'Room-scoped test');

    const bobSocket = await connectAndAuth(bobToken);
    // Bob never joins - equivalent to not having this chat open.

    const bobEventPromise = new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), 400);
      bobSocket.once('message_edited', (data) => {
        clearTimeout(timer);
        resolve(data);
      });
    });

    await request(app)
      .patch(`/api/messages/${messageId}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ content: 'Edited without Bob watching' });

    expect(await bobEventPromise).toBeNull();

    bobSocket.close();
  });
});
