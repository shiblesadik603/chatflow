import request from 'supertest';
import { app } from '../src/app.js';
import { Conversation } from '../src/models/Conversation.js';
import { connectTestDB, clearTestDB, disconnectTestDB } from './utils/testDb.js';
import { createTestUser } from './utils/authHelpers.js';

beforeAll(connectTestDB);
afterEach(clearTestDB);
afterAll(disconnectTestDB);

const auth = (token) => `Bearer ${token}`;

describe('POST /api/conversations', () => {
  it('creates a new private conversation (201)', async () => {
    const { accessToken: aliceToken } = await createTestUser({ name: 'Alice Convo' });
    const { user: bob } = await createTestUser({ name: 'Bob Convo' });

    const res = await request(app)
      .post('/api/conversations')
      .set('Authorization', auth(aliceToken))
      .send({ participantId: bob._id });

    expect(res.status).toBe(201);
    expect(res.body.data.conversation.type).toBe('private');
    expect(res.body.data.conversation.participants).toHaveLength(2);
  });

  it('returns the existing conversation (200) on a second call, in either direction', async () => {
    const { accessToken: aliceToken, user: alice } = await createTestUser({ name: 'Alice Convo2' });
    const { accessToken: bobToken, user: bob } = await createTestUser({ name: 'Bob Convo2' });

    const first = await request(app)
      .post('/api/conversations')
      .set('Authorization', auth(aliceToken))
      .send({ participantId: bob._id });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post('/api/conversations')
      .set('Authorization', auth(bobToken))
      .send({ participantId: alice._id });

    expect(second.status).toBe(200);
    expect(second.body.data.conversation._id).toBe(first.body.data.conversation._id);

    const count = await Conversation.countDocuments({ type: 'private' });
    expect(count).toBe(1);
  });

  it('rejects starting a conversation with yourself', async () => {
    const { accessToken, user } = await createTestUser();
    const res = await request(app)
      .post('/api/conversations')
      .set('Authorization', auth(accessToken))
      .send({ participantId: user._id });

    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('CANNOT_MESSAGE_SELF');
  });

  it('rejects a nonexistent participant', async () => {
    const { accessToken } = await createTestUser();
    const res = await request(app)
      .post('/api/conversations')
      .set('Authorization', auth(accessToken))
      .send({ participantId: '64f000000000000000000000' });

    expect(res.status).toBe(404);
    expect(res.body.errorCode).toBe('USER_NOT_FOUND');
  });

  it('rejects starting a conversation with a blocked user, in either direction', async () => {
    const { accessToken: aliceToken, user: alice } = await createTestUser({ name: 'Alice Blocker' });
    const { accessToken: bobToken, user: bob } = await createTestUser({ name: 'Bob Blocked' });

    await request(app).post(`/api/users/${bob._id}/block`).set('Authorization', auth(aliceToken));

    const aliceToBob = await request(app)
      .post('/api/conversations')
      .set('Authorization', auth(aliceToken))
      .send({ participantId: bob._id });
    expect(aliceToBob.status).toBe(403);
    expect(aliceToBob.body.errorCode).toBe('BLOCKED');

    const bobToAlice = await request(app)
      .post('/api/conversations')
      .set('Authorization', auth(bobToken))
      .send({ participantId: alice._id });
    expect(bobToAlice.status).toBe(403);
    expect(bobToAlice.body.errorCode).toBe('BLOCKED');
  });

  it('creates exactly one conversation when both users click "start chat" at the same time', async () => {
    const { accessToken: aliceToken, user: alice } = await createTestUser({ name: 'Race Alice' });
    const { accessToken: bobToken, user: bob } = await createTestUser({ name: 'Race Bob' });

    const [resA, resB] = await Promise.all([
      request(app)
        .post('/api/conversations')
        .set('Authorization', auth(aliceToken))
        .send({ participantId: bob._id }),
      request(app)
        .post('/api/conversations')
        .set('Authorization', auth(bobToken))
        .send({ participantId: alice._id }),
    ]);

    expect([200, 201]).toContain(resA.status);
    expect([200, 201]).toContain(resB.status);
    expect(resA.body.data.conversation._id).toBe(resB.body.data.conversation._id);

    const count = await Conversation.countDocuments({ type: 'private' });
    expect(count).toBe(1);
  });
});

describe('GET /api/conversations', () => {
  it('lists only conversations the current user participates in', async () => {
    const { accessToken: aliceToken } = await createTestUser({ name: 'Alice List' });
    const { user: bob } = await createTestUser({ name: 'Bob List' });
    const { accessToken: carolToken, user: carol } = await createTestUser({ name: 'Carol List' });
    const { user: dave } = await createTestUser({ name: 'Dave List' });

    // Alice <-> Bob (Alice should see this one).
    await request(app)
      .post('/api/conversations')
      .set('Authorization', auth(aliceToken))
      .send({ participantId: bob._id });

    // Carol <-> Dave (Alice is not involved - should NOT appear in her list).
    await request(app)
      .post('/api/conversations')
      .set('Authorization', auth(carolToken))
      .send({ participantId: dave._id });

    const res = await request(app).get('/api/conversations').set('Authorization', auth(aliceToken));

    expect(res.status).toBe(200);
    expect(res.body.data.conversations).toHaveLength(1);
    const participantIds = res.body.data.conversations[0].participants.map((p) => p._id);
    expect(participantIds).toContain(bob._id);
    expect(participantIds).not.toContain(carol._id);
    expect(participantIds).not.toContain(dave._id);
  });
});

describe('GET /api/conversations/:id', () => {
  it('rejects a non-participant with 403', async () => {
    const { accessToken: aliceToken } = await createTestUser({ name: 'Alice Get' });
    const { user: bob } = await createTestUser({ name: 'Bob Get' });
    const { accessToken: outsiderToken } = await createTestUser({ name: 'Outsider Get' });

    const createRes = await request(app)
      .post('/api/conversations')
      .set('Authorization', auth(aliceToken))
      .send({ participantId: bob._id });

    const res = await request(app)
      .get(`/api/conversations/${createRes.body.data.conversation._id}`)
      .set('Authorization', auth(outsiderToken));

    expect(res.status).toBe(403);
    expect(res.body.errorCode).toBe('NOT_A_PARTICIPANT');
  });

  it('returns 404 for a well-formed id that does not exist', async () => {
    const { accessToken } = await createTestUser();
    const res = await request(app)
      .get('/api/conversations/64f000000000000000000000')
      .set('Authorization', auth(accessToken));

    expect(res.status).toBe(404);
    expect(res.body.errorCode).toBe('CONVERSATION_NOT_FOUND');
  });

  it('rejects a malformed id with 400', async () => {
    const { accessToken } = await createTestUser();
    const res = await request(app)
      .get('/api/conversations/not-an-id')
      .set('Authorization', auth(accessToken));

    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('INVALID_ID');
  });
});

describe('DELETE /api/conversations/:id', () => {
  it('deletes a private conversation for a participant', async () => {
    const { accessToken: aliceToken } = await createTestUser({ name: 'Alice Del' });
    const { user: bob } = await createTestUser({ name: 'Bob Del' });

    const createRes = await request(app)
      .post('/api/conversations')
      .set('Authorization', auth(aliceToken))
      .send({ participantId: bob._id });
    const conversationId = createRes.body.data.conversation._id;

    const deleteRes = await request(app)
      .delete(`/api/conversations/${conversationId}`)
      .set('Authorization', auth(aliceToken));
    expect(deleteRes.status).toBe(200);

    const getRes = await request(app)
      .get(`/api/conversations/${conversationId}`)
      .set('Authorization', auth(aliceToken));
    expect(getRes.status).toBe(404);
  });

  it('rejects a non-participant trying to delete', async () => {
    const { accessToken: aliceToken } = await createTestUser({ name: 'Alice Del2' });
    const { user: bob } = await createTestUser({ name: 'Bob Del2' });
    const { accessToken: outsiderToken } = await createTestUser({ name: 'Outsider Del' });

    const createRes = await request(app)
      .post('/api/conversations')
      .set('Authorization', auth(aliceToken))
      .send({ participantId: bob._id });

    const res = await request(app)
      .delete(`/api/conversations/${createRes.body.data.conversation._id}`)
      .set('Authorization', auth(outsiderToken));

    expect(res.status).toBe(403);
  });
});
