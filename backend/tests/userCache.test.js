import request from 'supertest';
import { app } from '../src/app.js';
import { redis } from '../src/config/redis.js';
import { connectTestDB, clearTestDB, disconnectTestDB } from './utils/testDb.js';
import { disconnectTestRedis } from './utils/testRedis.js';
import { createTestUser } from './utils/authHelpers.js';

beforeAll(connectTestDB);
afterEach(clearTestDB);
afterAll(async () => {
  await disconnectTestRedis();
  await disconnectTestDB();
});

const auth = (token) => `Bearer ${token}`;
const cacheKey = (userId) => `cache:profile:${userId}`;

describe('public profile caching', () => {
  it('populates the cache on the first read', async () => {
    const { accessToken } = await createTestUser({ name: 'Cache Reader' });
    const { user: target } = await createTestUser({ name: 'Cache Target' });

    expect(await redis.get(cacheKey(target._id))).toBeNull();

    const res = await request(app).get(`/api/users/${target._id}`).set('Authorization', auth(accessToken));
    expect(res.status).toBe(200);

    const cached = await redis.get(cacheKey(target._id));
    expect(cached).not.toBeNull();
    expect(JSON.parse(cached).name).toBe('Cache Target');
  });

  it('actually reads from the cache, not just writes to it', async () => {
    const { accessToken } = await createTestUser({ name: 'Cache Reader2' });
    const { user: target } = await createTestUser({ name: 'Real Name' });

    // Warm the cache with a real request first.
    await request(app).get(`/api/users/${target._id}`).set('Authorization', auth(accessToken));

    // Tamper with the cached value directly - if the endpoint is genuinely
    // reading from the cache (not silently going to Mongo every time),
    // the next request must return this tampered name, not the real one.
    const tampered = { name: 'Definitely From Cache', avatar: '', bio: '', isOnline: false, lastSeen: new Date() };
    await redis.set(cacheKey(target._id), JSON.stringify(tampered), 'EX', 60);

    const res = await request(app).get(`/api/users/${target._id}`).set('Authorization', auth(accessToken));
    expect(res.body.data.user.name).toBe('Definitely From Cache');
  });

  it('invalidates the cache when the user updates their own profile', async () => {
    const { accessToken, user } = await createTestUser({ name: 'Original Name' });
    const { accessToken: viewerToken } = await createTestUser({ name: 'Viewer' });

    // Warm the cache via another user viewing this profile.
    await request(app).get(`/api/users/${user._id}`).set('Authorization', auth(viewerToken));
    expect(await redis.get(cacheKey(user._id))).not.toBeNull();

    await request(app).patch('/api/users/me').set('Authorization', auth(accessToken)).send({ name: 'New Name' });

    expect(await redis.get(cacheKey(user._id))).toBeNull();

    const res = await request(app).get(`/api/users/${user._id}`).set('Authorization', auth(viewerToken));
    expect(res.body.data.user.name).toBe('New Name');
  });
});
