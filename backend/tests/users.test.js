import request from 'supertest';
import { app } from '../src/app.js';
import { connectTestDB, clearTestDB, disconnectTestDB } from './utils/testDb.js';
import { disconnectTestRedis } from './utils/testRedis.js';
import { createTestUser } from './utils/authHelpers.js';

beforeAll(connectTestDB);
afterEach(clearTestDB);
afterAll(async () => {
  // app.js transitively opens a Redis connection now (see health.test.js).
  await disconnectTestRedis();
  await disconnectTestDB();
});

const auth = (token) => `Bearer ${token}`;

describe('GET /api/users/me', () => {
  it('requires authentication', async () => {
    const res = await request(app).get('/api/users/me');
    expect(res.status).toBe(401);
  });

  it('returns the current user', async () => {
    const { accessToken, user } = await createTestUser();
    const res = await request(app).get('/api/users/me').set('Authorization', auth(accessToken));

    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(user.email);
  });
});

describe('PATCH /api/users/me', () => {
  it('updates name and bio', async () => {
    const { accessToken } = await createTestUser();
    const res = await request(app)
      .patch('/api/users/me')
      .set('Authorization', auth(accessToken))
      .send({ name: 'Updated Name', bio: 'New bio' });

    expect(res.status).toBe(200);
    expect(res.body.data.user.name).toBe('Updated Name');
    expect(res.body.data.user.bio).toBe('New bio');
  });

  it('rejects an empty update body', async () => {
    const { accessToken } = await createTestUser();
    const res = await request(app)
      .patch('/api/users/me')
      .set('Authorization', auth(accessToken))
      .send({});

    expect(res.status).toBe(422);
    expect(res.body.errorCode).toBe('VALIDATION_ERROR');
  });
});

describe('GET /api/users/:id', () => {
  it('returns a public profile without email or blockedUsers', async () => {
    const { accessToken } = await createTestUser();
    const { user: target } = await createTestUser();

    const res = await request(app)
      .get(`/api/users/${target._id}`)
      .set('Authorization', auth(accessToken));

    expect(res.status).toBe(200);
    expect(res.body.data.user.name).toBe(target.name);
    expect(res.body.data.user.email).toBeUndefined();
    expect(res.body.data.user.blockedUsers).toBeUndefined();
  });

  it('rejects a malformed id with 400', async () => {
    const { accessToken } = await createTestUser();
    const res = await request(app)
      .get('/api/users/not-a-valid-id')
      .set('Authorization', auth(accessToken));

    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('INVALID_ID');
  });

  it('returns 404 for a well-formed id that does not exist', async () => {
    const { accessToken } = await createTestUser();
    const res = await request(app)
      .get('/api/users/64f000000000000000000000')
      .set('Authorization', auth(accessToken));

    expect(res.status).toBe(404);
    expect(res.body.errorCode).toBe('USER_NOT_FOUND');
  });
});

describe('GET /api/users/search', () => {
  it('finds users by name prefix, excluding the requester', async () => {
    const { accessToken } = await createTestUser({ name: 'Alice Search' });
    await createTestUser({ name: 'Alicia Search' });
    await createTestUser({ name: 'Bob Search' });

    const res = await request(app)
      .get('/api/users/search?q=Alic')
      .set('Authorization', auth(accessToken));

    expect(res.status).toBe(200);
    const names = res.body.data.users.map((u) => u.name);
    expect(names).toContain('Alicia Search');
    expect(names).not.toContain('Alice Search'); // requester excluded
    expect(names).not.toContain('Bob Search');
  });

  it('excludes users involved in a block relationship, either direction', async () => {
    const { accessToken: meToken, user: me } = await createTestUser({ name: 'Blocker Zed' });
    const { user: iBlocked } = await createTestUser({ name: 'Blocked Zed' });
    const { accessToken: theyBlockedMeToken, user: theyBlockedMe } = await createTestUser({
      name: 'BlockedMe Zed',
    });

    await request(app)
      .post(`/api/users/${iBlocked._id}/block`)
      .set('Authorization', auth(meToken));
    await request(app)
      .post(`/api/users/${me._id}/block`)
      .set('Authorization', auth(theyBlockedMeToken));

    const res = await request(app).get('/api/users/search?q=Zed').set('Authorization', auth(meToken));

    const names = res.body.data.users.map((u) => u.name);
    expect(names).not.toContain('Blocked Zed');
    expect(names).not.toContain('BlockedMe Zed');
  });
});

describe('POST /api/users/:id/block and DELETE /api/users/:id/block', () => {
  it('rejects blocking yourself', async () => {
    const { accessToken, user } = await createTestUser();
    const res = await request(app)
      .post(`/api/users/${user._id}/block`)
      .set('Authorization', auth(accessToken));

    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('CANNOT_BLOCK_SELF');
  });

  it('blocks a user, rejects a duplicate block, then unblocks', async () => {
    const { accessToken } = await createTestUser();
    const { user: target } = await createTestUser();

    const blockRes = await request(app)
      .post(`/api/users/${target._id}/block`)
      .set('Authorization', auth(accessToken));
    expect(blockRes.status).toBe(200);

    const duplicateRes = await request(app)
      .post(`/api/users/${target._id}/block`)
      .set('Authorization', auth(accessToken));
    expect(duplicateRes.status).toBe(409);
    expect(duplicateRes.body.errorCode).toBe('ALREADY_BLOCKED');

    const unblockRes = await request(app)
      .delete(`/api/users/${target._id}/block`)
      .set('Authorization', auth(accessToken));
    expect(unblockRes.status).toBe(200);

    const unblockAgainRes = await request(app)
      .delete(`/api/users/${target._id}/block`)
      .set('Authorization', auth(accessToken));
    expect(unblockAgainRes.status).toBe(404);
    expect(unblockAgainRes.body.errorCode).toBe('NOT_BLOCKED');
  });

  it('returns 404 when blocking a user that does not exist', async () => {
    const { accessToken } = await createTestUser();
    const res = await request(app)
      .post('/api/users/64f000000000000000000000/block')
      .set('Authorization', auth(accessToken));

    expect(res.status).toBe(404);
    expect(res.body.errorCode).toBe('USER_NOT_FOUND');
  });
});
