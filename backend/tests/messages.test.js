import request from 'supertest';
import { app } from '../src/app.js';
import { Message } from '../src/models/Message.js';
import { connectTestDB, clearTestDB, disconnectTestDB } from './utils/testDb.js';
import { createTestUser } from './utils/authHelpers.js';

beforeAll(connectTestDB);
afterEach(clearTestDB);
afterAll(disconnectTestDB);

const auth = (token) => `Bearer ${token}`;

const createConversation = async (token, participantId) => {
  const res = await request(app)
    .post('/api/conversations')
    .set('Authorization', auth(token))
    .send({ participantId });
  return res.body.data.conversation._id;
};

describe('POST /api/conversations/:conversationId/messages', () => {
  it('creates a text message', async () => {
    const { accessToken: aliceToken } = await createTestUser({ name: 'Alice Msg' });
    const { user: bob } = await createTestUser({ name: 'Bob Msg' });
    const conversationId = await createConversation(aliceToken, bob._id);

    const res = await request(app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', auth(aliceToken))
      .send({ content: 'Hello Bob' });

    expect(res.status).toBe(201);
    expect(res.body.data.message.content).toBe('Hello Bob');
    expect(res.body.data.message.sender.name).toBe('Alice Msg');
  });

  it('creates an image message with an attachment', async () => {
    const { accessToken: aliceToken } = await createTestUser({ name: 'Alice Img' });
    const { user: bob } = await createTestUser({ name: 'Bob Img' });
    const conversationId = await createConversation(aliceToken, bob._id);

    const res = await request(app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', auth(aliceToken))
      .send({ messageType: 'image', attachments: [{ url: 'https://example.com/pic.jpg' }] });

    expect(res.status).toBe(201);
    expect(res.body.data.message.messageType).toBe('image');
    expect(res.body.data.message.attachments).toHaveLength(1);
  });

  it('rejects a text message with no content', async () => {
    const { accessToken: aliceToken } = await createTestUser({ name: 'Alice NoContent' });
    const { user: bob } = await createTestUser({ name: 'Bob NoContent' });
    const conversationId = await createConversation(aliceToken, bob._id);

    const res = await request(app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', auth(aliceToken))
      .send({});

    expect(res.status).toBe(422);
    expect(res.body.errorCode).toBe('VALIDATION_ERROR');
  });

  it('rejects an image message with no attachments', async () => {
    const { accessToken: aliceToken } = await createTestUser({ name: 'Alice NoAttach' });
    const { user: bob } = await createTestUser({ name: 'Bob NoAttach' });
    const conversationId = await createConversation(aliceToken, bob._id);

    const res = await request(app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', auth(aliceToken))
      .send({ messageType: 'image' });

    expect(res.status).toBe(422);
  });

  it('rejects a non-participant', async () => {
    const { accessToken: aliceToken } = await createTestUser({ name: 'Alice Outsider' });
    const { user: bob } = await createTestUser({ name: 'Bob Outsider' });
    const { accessToken: outsiderToken } = await createTestUser({ name: 'Outsider Msg' });
    const conversationId = await createConversation(aliceToken, bob._id);

    const res = await request(app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', auth(outsiderToken))
      .send({ content: 'sneaky' });

    expect(res.status).toBe(403);
    expect(res.body.errorCode).toBe('NOT_A_PARTICIPANT');
  });

  it('rejects messaging a user who has blocked you', async () => {
    const { accessToken: aliceToken } = await createTestUser({ name: 'Alice BlockMsg' });
    const { accessToken: bobToken, user: bob } = await createTestUser({ name: 'Bob BlockMsg' });
    const conversationId = await createConversation(aliceToken, bob._id);

    // Bob blocks Alice after the conversation already exists.
    const aliceId = (await request(app).get('/api/users/me').set('Authorization', auth(aliceToken))).body
      .data.user._id;
    await request(app).post(`/api/users/${aliceId}/block`).set('Authorization', auth(bobToken));

    const res = await request(app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', auth(aliceToken))
      .send({ content: 'hello?' });

    expect(res.status).toBe(403);
    expect(res.body.errorCode).toBe('BLOCKED');
  });

  it('is idempotent for retried requests with the same clientMessageId', async () => {
    const { accessToken: aliceToken } = await createTestUser({ name: 'Alice Idem' });
    const { user: bob } = await createTestUser({ name: 'Bob Idem' });
    const conversationId = await createConversation(aliceToken, bob._id);

    const body = { content: 'Retried message', clientMessageId: 'client-uuid-123' };

    const first = await request(app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', auth(aliceToken))
      .send(body);
    expect(first.status).toBe(201);

    const retry = await request(app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', auth(aliceToken))
      .send(body);
    expect(retry.status).toBe(200);
    expect(retry.body.data.message._id).toBe(first.body.data.message._id);

    const count = await Message.countDocuments({ conversation: conversationId });
    expect(count).toBe(1);
  });
});

describe('GET /api/conversations/:conversationId/messages', () => {
  it('paginates with a cursor, oldest to newest within each page', async () => {
    const { accessToken: aliceToken } = await createTestUser({ name: 'Alice Page' });
    const { user: bob } = await createTestUser({ name: 'Bob Page' });
    const conversationId = await createConversation(aliceToken, bob._id);

    for (let i = 1; i <= 5; i += 1) {
      await request(app)
        .post(`/api/conversations/${conversationId}/messages`)
        .set('Authorization', auth(aliceToken))
        .send({ content: `Message ${i}` });
    }

    const firstPage = await request(app)
      .get(`/api/conversations/${conversationId}/messages?limit=2`)
      .set('Authorization', auth(aliceToken));

    expect(firstPage.status).toBe(200);
    expect(firstPage.body.data.messages).toHaveLength(2);
    expect(firstPage.body.data.hasMore).toBe(true);
    // Newest 2 of 5: "Message 4", "Message 5", oldest-first within the page.
    expect(firstPage.body.data.messages.map((m) => m.content)).toEqual(['Message 4', 'Message 5']);

    const secondPage = await request(app)
      .get(`/api/conversations/${conversationId}/messages?limit=2&before=${firstPage.body.data.nextCursor}`)
      .set('Authorization', auth(aliceToken));

    expect(secondPage.body.data.messages.map((m) => m.content)).toEqual(['Message 2', 'Message 3']);
    expect(secondPage.body.data.hasMore).toBe(true);

    const thirdPage = await request(app)
      .get(`/api/conversations/${conversationId}/messages?limit=2&before=${secondPage.body.data.nextCursor}`)
      .set('Authorization', auth(aliceToken));

    expect(thirdPage.body.data.messages.map((m) => m.content)).toEqual(['Message 1']);
    expect(thirdPage.body.data.hasMore).toBe(false);
    expect(thirdPage.body.data.nextCursor).toBeNull();
  });

  it('rejects a non-participant', async () => {
    const { accessToken: aliceToken } = await createTestUser({ name: 'Alice PageAuth' });
    const { user: bob } = await createTestUser({ name: 'Bob PageAuth' });
    const { accessToken: outsiderToken } = await createTestUser({ name: 'Outsider Page' });
    const conversationId = await createConversation(aliceToken, bob._id);

    const res = await request(app)
      .get(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', auth(outsiderToken));

    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/messages/:id', () => {
  it('lets the sender edit their own text message', async () => {
    const { accessToken: aliceToken } = await createTestUser({ name: 'Alice Edit' });
    const { user: bob } = await createTestUser({ name: 'Bob Edit' });
    const conversationId = await createConversation(aliceToken, bob._id);

    const createRes = await request(app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', auth(aliceToken))
      .send({ content: 'Original' });
    const messageId = createRes.body.data.message._id;

    const res = await request(app)
      .patch(`/api/messages/${messageId}`)
      .set('Authorization', auth(aliceToken))
      .send({ content: 'Edited' });

    expect(res.status).toBe(200);
    expect(res.body.data.message.content).toBe('Edited');
    expect(res.body.data.message.isEdited).toBe(true);
  });

  it('rejects editing someone else\'s message', async () => {
    const { accessToken: aliceToken } = await createTestUser({ name: 'Alice EditAuth' });
    const { accessToken: bobToken, user: bob } = await createTestUser({ name: 'Bob EditAuth' });
    const conversationId = await createConversation(aliceToken, bob._id);

    const createRes = await request(app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', auth(aliceToken))
      .send({ content: 'Mine' });
    const messageId = createRes.body.data.message._id;

    const res = await request(app)
      .patch(`/api/messages/${messageId}`)
      .set('Authorization', auth(bobToken))
      .send({ content: 'Hijacked' });

    expect(res.status).toBe(403);
    expect(res.body.errorCode).toBe('NOT_MESSAGE_OWNER');
  });

  it('rejects editing a deleted message', async () => {
    const { accessToken: aliceToken } = await createTestUser({ name: 'Alice EditDel' });
    const { user: bob } = await createTestUser({ name: 'Bob EditDel' });
    const conversationId = await createConversation(aliceToken, bob._id);

    const createRes = await request(app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', auth(aliceToken))
      .send({ content: 'To be deleted' });
    const messageId = createRes.body.data.message._id;

    await request(app).delete(`/api/messages/${messageId}`).set('Authorization', auth(aliceToken));

    const res = await request(app)
      .patch(`/api/messages/${messageId}`)
      .set('Authorization', auth(aliceToken))
      .send({ content: 'Nope' });

    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('MESSAGE_DELETED');
  });

  it('rejects editing a non-text message', async () => {
    const { accessToken: aliceToken } = await createTestUser({ name: 'Alice EditImg' });
    const { user: bob } = await createTestUser({ name: 'Bob EditImg' });
    const conversationId = await createConversation(aliceToken, bob._id);

    const createRes = await request(app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', auth(aliceToken))
      .send({ messageType: 'image', attachments: [{ url: 'https://example.com/a.png' }] });
    const messageId = createRes.body.data.message._id;

    const res = await request(app)
      .patch(`/api/messages/${messageId}`)
      .set('Authorization', auth(aliceToken))
      .send({ content: 'caption?' });

    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('NOT_EDITABLE');
  });

  it('returns 404 for a nonexistent message', async () => {
    const { accessToken } = await createTestUser();
    const res = await request(app)
      .patch('/api/messages/64f000000000000000000000')
      .set('Authorization', auth(accessToken))
      .send({ content: 'x' });

    expect(res.status).toBe(404);
    expect(res.body.errorCode).toBe('MESSAGE_NOT_FOUND');
  });
});

describe('DELETE /api/messages/:id', () => {
  it('soft-deletes the sender\'s own message and clears its content', async () => {
    const { accessToken: aliceToken } = await createTestUser({ name: 'Alice Del' });
    const { user: bob } = await createTestUser({ name: 'Bob Del' });
    const conversationId = await createConversation(aliceToken, bob._id);

    const createRes = await request(app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', auth(aliceToken))
      .send({ content: 'Secret' });
    const messageId = createRes.body.data.message._id;

    const res = await request(app)
      .delete(`/api/messages/${messageId}`)
      .set('Authorization', auth(aliceToken));
    expect(res.status).toBe(200);

    const stored = await Message.findById(messageId);
    expect(stored.isDeleted).toBe(true);
    expect(stored.content).toBe('');
  });

  it('rejects deleting someone else\'s message', async () => {
    const { accessToken: aliceToken } = await createTestUser({ name: 'Alice DelAuth' });
    const { accessToken: bobToken, user: bob } = await createTestUser({ name: 'Bob DelAuth' });
    const conversationId = await createConversation(aliceToken, bob._id);

    const createRes = await request(app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', auth(aliceToken))
      .send({ content: 'Mine' });
    const messageId = createRes.body.data.message._id;

    const res = await request(app)
      .delete(`/api/messages/${messageId}`)
      .set('Authorization', auth(bobToken));

    expect(res.status).toBe(403);
  });

  it('rejects deleting an already-deleted message', async () => {
    const { accessToken: aliceToken } = await createTestUser({ name: 'Alice DoubleDel' });
    const { user: bob } = await createTestUser({ name: 'Bob DoubleDel' });
    const conversationId = await createConversation(aliceToken, bob._id);

    const createRes = await request(app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', auth(aliceToken))
      .send({ content: 'Gone soon' });
    const messageId = createRes.body.data.message._id;

    await request(app).delete(`/api/messages/${messageId}`).set('Authorization', auth(aliceToken));
    const res = await request(app)
      .delete(`/api/messages/${messageId}`)
      .set('Authorization', auth(aliceToken));

    expect(res.status).toBe(409);
    expect(res.body.errorCode).toBe('ALREADY_DELETED');
  });
});
