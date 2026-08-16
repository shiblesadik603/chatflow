import request from 'supertest';
import { app } from '../src/app.js';
import { swaggerSpec } from '../src/config/swagger.js';
import { disconnectTestRedis } from './utils/testRedis.js';

// app.js transitively opens a Redis connection just by being imported
// (see health.test.js) - every file that imports it needs to close it.
afterAll(disconnectTestRedis);

// swaggerJsdoc silently produces a spec with a missing/empty `paths` object
// if a JSDoc comment block has a typo breaking its YAML, rather than
// throwing - Phase 20 never had a test proving the spec any route handler
// actually documents itself correctly ends up in the generated output, or
// that the endpoints serving it are even reachable.
describe('OpenAPI spec', () => {
  it('is well-formed and documents every route file', () => {
    expect(swaggerSpec.openapi).toBe('3.0.3');
    expect(swaggerSpec.info.title).toBeTruthy();
    expect(Object.keys(swaggerSpec.paths).length).toBeGreaterThan(20);

    // One representative path per route file - catches a whole file's
    // JSDoc silently failing to register, not just a typo in one block.
    const paths = Object.keys(swaggerSpec.paths);
    expect(paths).toContain('/api/health');
    expect(paths).toContain('/api/auth/login');
    expect(paths).toContain('/api/users/me');
    expect(paths).toContain('/api/conversations');
    expect(paths).toContain('/api/messages/{id}');
    expect(paths).toContain('/api/groups');
    expect(paths).toContain('/api/uploads/chat');
    expect(paths).toContain('/api/dashboard/status');
  });

  it('serves the raw spec as JSON', async () => {
    const res = await request(app).get('/api-docs.json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe('3.0.3');
    expect(res.body.paths['/api/health']).toBeDefined();
  });

  it('serves the interactive docs UI', async () => {
    const res = await request(app).get('/api-docs/');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
  });
});
