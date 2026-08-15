import request from 'supertest';
import { app } from '../src/app.js';
import { disconnectTestRedis } from './utils/testRedis.js';

// app.js now transitively imports the Redis client (messageController.js
// needs getIO() from sockets/index.js, which pulls in presenceHandlers ->
// presenceService -> config/redis.js), which connects at import time
// regardless of whether any test here uses sockets. Every file that
// imports app.js needs to close it, or Jest hangs on exit.
afterAll(disconnectTestRedis);

describe('GET /api/health', () => {
  it('returns 200 and a success payload', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('unknown route', () => {
  it('returns a consistent 404 error shape', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body).toEqual(
      expect.objectContaining({ success: false, errorCode: 'ROUTE_NOT_FOUND' })
    );
  });
});
