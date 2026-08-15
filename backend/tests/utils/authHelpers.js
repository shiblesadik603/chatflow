import request from 'supertest';
import { app } from '../../src/app.js';

let counter = 0;

// Registers a fresh user via the real /api/auth/register endpoint (not a
// DB shortcut) so every test exercises the same code path a real client
// would, and returns the token needed to act as that user.
export const createTestUser = async (overrides = {}) => {
  counter += 1;
  const payload = {
    name: `Test User ${counter}`,
    email: `user${counter}-${Date.now()}@example.com`,
    password: 'password123',
    ...overrides,
  };

  const res = await request(app).post('/api/auth/register').send(payload);

  return { user: res.body.data.user, accessToken: res.body.data.accessToken };
};
