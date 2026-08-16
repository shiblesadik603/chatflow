import http from 'http';
import request from 'supertest';
import { io as ioClient } from 'socket.io-client';
import { app } from '../src/app.js';
import { Group } from '../src/models/Group.js';
import { Conversation } from '../src/models/Conversation.js';
import { Message } from '../src/models/Message.js';
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

const auth = (token) => `Bearer ${token}`;

const createGroup = async (token, name, memberIds) =>
  request(app).post('/api/groups').set('Authorization', auth(token)).send({ name, memberIds });

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

const waitForEvent = (socket, event, ms = 500) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), ms);
    socket.once(event, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });

describe('POST /api/groups', () => {
  it('creates a group with the creator as the sole admin and a member', async () => {
    const { accessToken, user: creator } = await createTestUser({ name: 'Creator' });
    const { user: bob } = await createTestUser({ name: 'Bob Group' });
    const { user: carol } = await createTestUser({ name: 'Carol Group' });

    const res = await createGroup(accessToken, 'Team Chat', [bob._id, carol._id]);

    expect(res.status).toBe(201);
    expect(res.body.data.group.name).toBe('Team Chat');
    expect(res.body.data.group.members).toHaveLength(3);
    expect(res.body.data.group.admins).toHaveLength(1);
    expect(res.body.data.group.admins[0]._id).toBe(creator._id);

    const conversation = await Conversation.findById(res.body.data.group.conversation);
    expect(conversation.type).toBe('group');
    expect(conversation.participants).toHaveLength(3);
    expect(conversation.group.toString()).toBe(res.body.data.group._id);
  });

  it('silently dedupes the creator if included in memberIds', async () => {
    const { accessToken, user: creator } = await createTestUser({ name: 'Creator Dup' });
    const { user: bob } = await createTestUser({ name: 'Bob Dup' });

    const res = await createGroup(accessToken, 'Dedup Test', [bob._id, creator._id]);

    expect(res.status).toBe(201);
    expect(res.body.data.group.members).toHaveLength(2); // not 3
  });

  it('rejects an empty memberIds array', async () => {
    const { accessToken } = await createTestUser();
    const res = await request(app)
      .post('/api/groups')
      .set('Authorization', auth(accessToken))
      .send({ name: 'Empty Group', memberIds: [] });

    expect(res.status).toBe(422);
  });

  it('rejects a nonexistent member', async () => {
    const { accessToken } = await createTestUser();
    const res = await createGroup(accessToken, 'Ghost Member', ['64f000000000000000000000']);

    expect(res.status).toBe(404);
    expect(res.body.errorCode).toBe('USER_NOT_FOUND');
  });
});

describe('GET /api/groups/:id', () => {
  it('lets a member view the group and rejects a non-member', async () => {
    const { accessToken } = await createTestUser({ name: 'Getter Creator' });
    const { user: bob } = await createTestUser({ name: 'Getter Bob' });
    const { accessToken: outsiderToken } = await createTestUser({ name: 'Getter Outsider' });
    const createRes = await createGroup(accessToken, 'Viewable', [bob._id]);
    const groupId = createRes.body.data.group._id;

    const memberRes = await request(app).get(`/api/groups/${groupId}`).set('Authorization', auth(accessToken));
    expect(memberRes.status).toBe(200);

    const outsiderRes = await request(app)
      .get(`/api/groups/${groupId}`)
      .set('Authorization', auth(outsiderToken));
    expect(outsiderRes.status).toBe(403);
    expect(outsiderRes.body.errorCode).toBe('NOT_A_MEMBER');
  });

  it('returns 404 for a nonexistent group', async () => {
    const { accessToken } = await createTestUser();
    const res = await request(app)
      .get('/api/groups/64f000000000000000000000')
      .set('Authorization', auth(accessToken));
    expect(res.status).toBe(404);
    expect(res.body.errorCode).toBe('GROUP_NOT_FOUND');
  });
});

describe('PATCH /api/groups/:id', () => {
  it('lets an admin rename the group and broadcasts a system message', async () => {
    const { accessToken } = await createTestUser({ name: 'Renamer' });
    const { accessToken: bobToken, user: bob } = await createTestUser({ name: 'Renamer Bob' });
    const createRes = await createGroup(accessToken, 'Old Name', [bob._id]);
    const groupId = createRes.body.data.group._id;
    const conversationId = createRes.body.data.group.conversation;

    const bobSocket = await connectAndAuth(bobToken);
    await emitWithAck(bobSocket, 'join_conversation', { conversationId });
    const eventPromise = waitForEvent(bobSocket, 'new_message');

    const res = await request(app)
      .patch(`/api/groups/${groupId}`)
      .set('Authorization', auth(accessToken))
      .send({ name: 'New Name' });

    expect(res.status).toBe(200);
    expect(res.body.data.group.name).toBe('New Name');

    const event = await eventPromise;
    expect(event.messageType).toBe('system');
    expect(event.content).toContain('New Name');

    bobSocket.close();
  });

  it('rejects a non-admin member', async () => {
    const { accessToken: creatorToken } = await createTestUser({ name: 'Owner' });
    const { accessToken: bobToken, user: bob } = await createTestUser({ name: 'Regular Member' });
    const createRes = await createGroup(creatorToken, 'Locked Name', [bob._id]);
    const groupId = createRes.body.data.group._id;

    const res = await request(app)
      .patch(`/api/groups/${groupId}`)
      .set('Authorization', auth(bobToken))
      .send({ name: 'Hijacked' });

    expect(res.status).toBe(403);
    expect(res.body.errorCode).toBe('NOT_GROUP_ADMIN');
  });
});

describe('POST /api/groups/:id/members', () => {
  it('lets an admin add new members and keeps the conversation in sync', async () => {
    const { accessToken } = await createTestUser({ name: 'Adder' });
    const { user: bob } = await createTestUser({ name: 'Adder Bob' });
    const { user: carol } = await createTestUser({ name: 'Adder Carol' });
    const createRes = await createGroup(accessToken, 'Growing Group', [bob._id]);
    const groupId = createRes.body.data.group._id;
    const conversationId = createRes.body.data.group.conversation;

    const res = await request(app)
      .post(`/api/groups/${groupId}/members`)
      .set('Authorization', auth(accessToken))
      .send({ memberIds: [carol._id] });

    expect(res.status).toBe(200);
    expect(res.body.data.addedCount).toBe(1);
    expect(res.body.data.group.members).toHaveLength(3);

    const conversation = await Conversation.findById(conversationId);
    expect(conversation.participants.map((p) => p.toString())).toContain(carol._id);
  });

  it('is a no-op when adding an already-existing member', async () => {
    const { accessToken } = await createTestUser({ name: 'Adder2' });
    const { user: bob } = await createTestUser({ name: 'Adder2 Bob' });
    const createRes = await createGroup(accessToken, 'Already In', [bob._id]);
    const groupId = createRes.body.data.group._id;

    const res = await request(app)
      .post(`/api/groups/${groupId}/members`)
      .set('Authorization', auth(accessToken))
      .send({ memberIds: [bob._id] });

    expect(res.status).toBe(200);
    expect(res.body.data.addedCount).toBe(0);
  });

  it('rejects a non-admin', async () => {
    const { accessToken: creatorToken } = await createTestUser({ name: 'Adder3' });
    const { accessToken: bobToken, user: bob } = await createTestUser({ name: 'Adder3 Bob' });
    const { user: carol } = await createTestUser({ name: 'Adder3 Carol' });
    const createRes = await createGroup(creatorToken, 'No Add Rights', [bob._id]);
    const groupId = createRes.body.data.group._id;

    const res = await request(app)
      .post(`/api/groups/${groupId}/members`)
      .set('Authorization', auth(bobToken))
      .send({ memberIds: [carol._id] });

    expect(res.status).toBe(403);
    expect(res.body.errorCode).toBe('NOT_GROUP_ADMIN');
  });
});

describe('DELETE /api/groups/:id/members/:userId', () => {
  it('lets an admin remove a member and keeps the conversation in sync', async () => {
    const { accessToken } = await createTestUser({ name: 'Remover' });
    const { user: bob } = await createTestUser({ name: 'Remover Bob' });
    const createRes = await createGroup(accessToken, 'Shrinking Group', [bob._id]);
    const groupId = createRes.body.data.group._id;
    const conversationId = createRes.body.data.group.conversation;

    const res = await request(app)
      .delete(`/api/groups/${groupId}/members/${bob._id}`)
      .set('Authorization', auth(accessToken));

    expect(res.status).toBe(200);
    expect(res.body.data.group.members).toHaveLength(1);

    const conversation = await Conversation.findById(conversationId);
    expect(conversation.participants.map((p) => p.toString())).not.toContain(bob._id);
  });

  it('redirects an admin trying to remove themselves to the leave endpoint', async () => {
    const { accessToken, user: creator } = await createTestUser({ name: 'SelfRemover' });
    const { user: bob } = await createTestUser({ name: 'SelfRemover Bob' });
    const createRes = await createGroup(accessToken, 'Self Removal', [bob._id]);
    const groupId = createRes.body.data.group._id;

    const res = await request(app)
      .delete(`/api/groups/${groupId}/members/${creator._id}`)
      .set('Authorization', auth(accessToken));

    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('USE_LEAVE_ENDPOINT');
  });

  it('rejects removing someone who is not a member', async () => {
    const { accessToken } = await createTestUser({ name: 'Remover2' });
    const { user: bob } = await createTestUser({ name: 'Remover2 Bob' });
    const { user: outsider } = await createTestUser({ name: 'Remover2 Outsider' });
    const createRes = await createGroup(accessToken, 'Not A Member', [bob._id]);
    const groupId = createRes.body.data.group._id;

    const res = await request(app)
      .delete(`/api/groups/${groupId}/members/${outsider._id}`)
      .set('Authorization', auth(accessToken));

    expect(res.status).toBe(404);
    expect(res.body.errorCode).toBe('MEMBER_NOT_FOUND');
  });
});

describe('POST /api/groups/:id/leave', () => {
  it('lets a regular member leave without affecting admins', async () => {
    const { accessToken: creatorToken } = await createTestUser({ name: 'StaysAdmin' });
    const { accessToken: bobToken, user: bob } = await createTestUser({ name: 'LeavesBob' });
    const createRes = await createGroup(creatorToken, 'Leave Test', [bob._id]);
    const groupId = createRes.body.data.group._id;

    const res = await request(app).post(`/api/groups/${groupId}/leave`).set('Authorization', auth(bobToken));

    expect(res.status).toBe(200);
    expect(res.body.data.deleted).toBe(false);

    const group = await Group.findById(groupId);
    expect(group.members.map((m) => m.toString())).not.toContain(bob._id);
    expect(group.admins).toHaveLength(1);
  });

  it('auto-promotes a new admin when the last admin leaves but members remain', async () => {
    const { accessToken: creatorToken, user: creator } = await createTestUser({ name: 'LastAdmin' });
    const { user: bob } = await createTestUser({ name: 'LastAdmin Bob' });
    const createRes = await createGroup(creatorToken, 'Admin Handoff', [bob._id]);
    const groupId = createRes.body.data.group._id;

    const res = await request(app)
      .post(`/api/groups/${groupId}/leave`)
      .set('Authorization', auth(creatorToken));

    expect(res.status).toBe(200);

    const group = await Group.findById(groupId);
    expect(group.members).toHaveLength(1);
    expect(group.admins).toHaveLength(1);
    expect(group.admins[0].toString()).toBe(bob._id);
    expect(group.admins[0].toString()).not.toBe(creator._id);
  });

  it('deletes the group, conversation, and messages when the last member leaves', async () => {
    const { accessToken } = await createTestUser({ name: 'SoloLeaver' });
    // A group technically needs >= 1 other member to create per validation,
    // so remove that member first via the admin endpoint, then leave alone.
    const { user: bob } = await createTestUser({ name: 'SoloLeaver Bob' });
    const createRes = await createGroup(accessToken, 'Solo Group', [bob._id]);
    const groupId = createRes.body.data.group._id;
    const conversationId = createRes.body.data.group.conversation;

    await request(app)
      .delete(`/api/groups/${groupId}/members/${bob._id}`)
      .set('Authorization', auth(accessToken));

    await request(app).post(`/api/conversations/${conversationId}/messages`).set('Authorization', auth(accessToken)).send({ content: 'last words' });

    const res = await request(app)
      .post(`/api/groups/${groupId}/leave`)
      .set('Authorization', auth(accessToken));

    expect(res.status).toBe(200);
    expect(res.body.data.deleted).toBe(true);

    expect(await Group.findById(groupId)).toBeNull();
    expect(await Conversation.findById(conversationId)).toBeNull();
    expect(await Message.countDocuments({ conversation: conversationId })).toBe(0);
  });

  it('rejects a non-member trying to leave', async () => {
    const { accessToken: creatorToken } = await createTestUser({ name: 'NonMemberLeave' });
    const { user: bob } = await createTestUser({ name: 'NonMemberLeave Bob' });
    const { accessToken: outsiderToken } = await createTestUser({ name: 'NonMemberLeave Outsider' });
    const createRes = await createGroup(creatorToken, 'Members Only', [bob._id]);
    const groupId = createRes.body.data.group._id;

    const res = await request(app)
      .post(`/api/groups/${groupId}/leave`)
      .set('Authorization', auth(outsiderToken));

    expect(res.status).toBe(403);
    expect(res.body.errorCode).toBe('NOT_A_MEMBER');
  });
});

describe('POST /api/groups/:id/admins', () => {
  it('lets an admin promote a member', async () => {
    const { accessToken } = await createTestUser({ name: 'Promoter' });
    const { user: bob } = await createTestUser({ name: 'Promoter Bob' });
    const createRes = await createGroup(accessToken, 'Promotion Test', [bob._id]);
    const groupId = createRes.body.data.group._id;

    const res = await request(app)
      .post(`/api/groups/${groupId}/admins`)
      .set('Authorization', auth(accessToken))
      .send({ userId: bob._id });

    expect(res.status).toBe(200);
    expect(res.body.data.group.admins.map((a) => a._id)).toContain(bob._id);
  });

  it('rejects promoting a non-member', async () => {
    const { accessToken } = await createTestUser({ name: 'Promoter2' });
    const { user: bob } = await createTestUser({ name: 'Promoter2 Bob' });
    const { user: outsider } = await createTestUser({ name: 'Promoter2 Outsider' });
    const createRes = await createGroup(accessToken, 'Promotion Guard', [bob._id]);
    const groupId = createRes.body.data.group._id;

    const res = await request(app)
      .post(`/api/groups/${groupId}/admins`)
      .set('Authorization', auth(accessToken))
      .send({ userId: outsider._id });

    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('NOT_A_MEMBER');
  });

  it('rejects promoting an already-admin', async () => {
    const { accessToken, user: creator } = await createTestUser({ name: 'Promoter3' });
    const { user: bob } = await createTestUser({ name: 'Promoter3 Bob' });
    const createRes = await createGroup(accessToken, 'Already Admin', [bob._id]);
    const groupId = createRes.body.data.group._id;

    const res = await request(app)
      .post(`/api/groups/${groupId}/admins`)
      .set('Authorization', auth(accessToken))
      .send({ userId: creator._id });

    expect(res.status).toBe(409);
    expect(res.body.errorCode).toBe('ALREADY_ADMIN');
  });

  it('rejects a non-admin trying to promote someone', async () => {
    const { accessToken: creatorToken } = await createTestUser({ name: 'Promoter4' });
    const { accessToken: bobToken, user: bob } = await createTestUser({ name: 'Promoter4 Bob' });
    const { user: carol } = await createTestUser({ name: 'Promoter4 Carol' });
    const createRes = await createGroup(creatorToken, 'No Promote Rights', [bob._id, carol._id]);
    const groupId = createRes.body.data.group._id;

    const res = await request(app)
      .post(`/api/groups/${groupId}/admins`)
      .set('Authorization', auth(bobToken))
      .send({ userId: carol._id });

    expect(res.status).toBe(403);
    expect(res.body.errorCode).toBe('NOT_GROUP_ADMIN');
  });
});

describe('group actions broadcast conversation_activity', () => {
  it('notifies a member who has not joined the room when a group is created', async () => {
    const { accessToken } = await createTestUser({ name: 'ActivityCreator' });
    const { accessToken: bobToken, user: bob } = await createTestUser({ name: 'ActivityBob' });

    const bobSocket = await connectAndAuth(bobToken);
    const eventPromise = waitForEvent(bobSocket, 'conversation_activity');

    const createRes = await createGroup(accessToken, 'Activity Group', [bob._id]);
    expect(createRes.status).toBe(201);

    const event = await eventPromise;
    expect(event.conversationId).toBe(createRes.body.data.group.conversation);

    bobSocket.close();
  });

  it('notifies a member who has not joined the room when the group is renamed', async () => {
    const { accessToken } = await createTestUser({ name: 'ActivityRenamer' });
    const { accessToken: bobToken, user: bob } = await createTestUser({ name: 'ActivityRenamerBob' });
    const createRes = await createGroup(accessToken, 'Old Activity Name', [bob._id]);
    const groupId = createRes.body.data.group._id;
    const conversationId = createRes.body.data.group.conversation;

    const bobSocket = await connectAndAuth(bobToken);
    // Deliberately not joining the conversation room - conversation_activity
    // must still reach Bob via his personal userId room.
    const eventPromise = waitForEvent(bobSocket, 'conversation_activity');

    await request(app)
      .patch(`/api/groups/${groupId}`)
      .set('Authorization', auth(accessToken))
      .send({ name: 'New Activity Name' });

    const event = await eventPromise;
    expect(event.conversationId).toBe(conversationId);

    bobSocket.close();
  });

  it('notifies a removed member directly, even though they are no longer in group.members', async () => {
    const { accessToken } = await createTestUser({ name: 'ActivityRemover' });
    const { accessToken: bobToken, user: bob } = await createTestUser({ name: 'ActivityRemoverBob' });
    const createRes = await createGroup(accessToken, 'Removal Activity Group', [bob._id]);
    const groupId = createRes.body.data.group._id;
    const conversationId = createRes.body.data.group.conversation;

    const bobSocket = await connectAndAuth(bobToken);
    const eventPromise = waitForEvent(bobSocket, 'conversation_activity');

    const res = await request(app)
      .delete(`/api/groups/${groupId}/members/${bob._id}`)
      .set('Authorization', auth(accessToken));
    expect(res.status).toBe(200);

    const event = await eventPromise;
    expect(event.conversationId).toBe(conversationId);

    bobSocket.close();
  });
});

describe('group messaging reuses the existing conversation/message APIs', () => {
  it('supports sending and listing messages in a group conversation with no group-specific code', async () => {
    const { accessToken: creatorToken } = await createTestUser({ name: 'GroupMsg Creator' });
    const { accessToken: bobToken, user: bob } = await createTestUser({ name: 'GroupMsg Bob' });
    const { user: carol } = await createTestUser({ name: 'GroupMsg Carol' });
    const createRes = await createGroup(creatorToken, 'Chatty Group', [bob._id, carol._id]);
    const conversationId = createRes.body.data.group.conversation;

    const sendRes = await request(app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', auth(bobToken))
      .send({ content: 'Hello everyone' });
    expect(sendRes.status).toBe(201);

    const listRes = await request(app)
      .get(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', auth(creatorToken));
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.messages.some((m) => m.content === 'Hello everyone')).toBe(true);
  });

  it('rejects deleting a group conversation directly, pointing at the leave endpoint', async () => {
    const { accessToken: creatorToken } = await createTestUser({ name: 'GroupDel Creator' });
    const { user: bob } = await createTestUser({ name: 'GroupDel Bob' });
    const createRes = await createGroup(creatorToken, 'No Direct Delete', [bob._id]);
    const conversationId = createRes.body.data.group.conversation;

    const res = await request(app)
      .delete(`/api/conversations/${conversationId}`)
      .set('Authorization', auth(creatorToken));

    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('USE_GROUP_LEAVE_ENDPOINT');
  });
});
