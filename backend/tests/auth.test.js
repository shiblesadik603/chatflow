import request from 'supertest';
import { app } from '../src/app.js';
import { User } from '../src/models/User.js';
import { RefreshToken } from '../src/models/RefreshToken.js';
import { connectTestDB, clearTestDB, disconnectTestDB } from './utils/testDb.js';

beforeAll(connectTestDB);
afterEach(clearTestDB);
afterAll(disconnectTestDB);

const validUser = { name: 'Test User', email: 'test@example.com', password: 'password123' };

describe('POST /api/auth/register', () => {
  it('creates a user and returns an access token plus a refresh cookie', async () => {
    const res = await request(app).post('/api/auth/register').send(validUser);

    expect(res.status).toBe(201);
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    expect(res.body.data.user.password).toBeUndefined();
    expect(res.headers['set-cookie'][0]).toMatch(/refreshToken=/);
  });

  it('rejects a duplicate email with 409', async () => {
    await request(app).post('/api/auth/register').send(validUser);
    const res = await request(app).post('/api/auth/register').send(validUser);

    expect(res.status).toBe(409);
    expect(res.body.errorCode).toBe('DUPLICATE_EMAIL');
  });

  it('rejects a short password with 422 and field-level details', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validUser, password: 'short' });

    expect(res.status).toBe(422);
    expect(res.body.errorCode).toBe('VALIDATION_ERROR');
    expect(res.body.details.password).toBeDefined();
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await request(app).post('/api/auth/register').send(validUser);
  });

  it('logs in with correct credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: validUser.email, password: validUser.password });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toEqual(expect.any(String));
  });

  it('rejects a wrong password with a generic 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: validUser.email, password: 'wrongpassword' });

    expect(res.status).toBe(401);
    expect(res.body.errorCode).toBe('INVALID_CREDENTIALS');
  });

  it('rejects an unknown email with the same generic 401 (no user enumeration)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'password123' });

    expect(res.status).toBe(401);
    expect(res.body.errorCode).toBe('INVALID_CREDENTIALS');
  });
});

describe('GET /api/auth/me', () => {
  it('rejects a request with no access token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.errorCode).toBe('NOT_AUTHENTICATED');
  });

  it('rejects a garbage token', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
    expect(res.body.errorCode).toBe('INVALID_TOKEN');
  });

  it('returns the current user for a valid access token', async () => {
    const registerRes = await request(app).post('/api/auth/register').send(validUser);
    const { accessToken } = registerRes.body.data;

    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(validUser.email);
  });
});

describe('POST /api/auth/refresh', () => {
  it('issues a new access token and rotates the refresh token', async () => {
    const agent = request.agent(app);
    const registerRes = await agent.post('/api/auth/register').send(validUser);
    const oldCookie = registerRes.headers['set-cookie'][0];

    const refreshRes = await agent.post('/api/auth/refresh');
    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.data.accessToken).toEqual(expect.any(String));

    // The old refresh token was deleted from the DB the moment it was used -
    // replaying it must now be rejected as revoked.
    const reuseRes = await request(app).post('/api/auth/refresh').set('Cookie', oldCookie);
    expect(reuseRes.status).toBe(401);
    expect(reuseRes.body.errorCode).toBe('REVOKED_REFRESH_TOKEN');
  });

  it('rejects a missing refresh token', async () => {
    const res = await request(app).post('/api/auth/refresh');
    expect(res.status).toBe(401);
    expect(res.body.errorCode).toBe('NOT_AUTHENTICATED');
  });
});

describe('POST /api/auth/logout', () => {
  it('ends the session so refresh no longer works', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/register').send(validUser);

    const logoutRes = await agent.post('/api/auth/logout');
    expect(logoutRes.status).toBe(200);

    const refreshRes = await agent.post('/api/auth/refresh');
    expect(refreshRes.status).toBe(401);
  });
});

describe('POST /api/auth/logout-all', () => {
  it('removes every session for the user, across devices', async () => {
    const registerRes = await request(app).post('/api/auth/register').send(validUser);
    const { accessToken } = registerRes.body.data;
    const user = await User.findOne({ email: validUser.email });

    // Simulate a second device logging in.
    await request(app)
      .post('/api/auth/login')
      .send({ email: validUser.email, password: validUser.password });

    expect(await RefreshToken.countDocuments({ user: user._id })).toBe(2);

    const res = await request(app)
      .post('/api/auth/logout-all')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(await RefreshToken.countDocuments({ user: user._id })).toBe(0);
  });

  it('requires authentication', async () => {
    const res = await request(app).post('/api/auth/logout-all');
    expect(res.status).toBe(401);
  });
});
