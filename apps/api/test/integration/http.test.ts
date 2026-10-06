/**
 * Transport-level guarantees.
 *
 * Two properties that are invisible in a unit test and expensive to
 * discover in production:
 *
 *   - `/health` must answer without credentials. An orchestrator's
 *     liveness probe has none, and a probe that reads 401 gets a healthy
 *     process restarted for failing auth.
 *
 *   - no response may be cacheable. The API emits an ETag; without an
 *     explicit `Cache-Control` the browser decides for itself, stores
 *     authenticated JSON, and later serves it from memory — which shows a
 *     signed-in UI while the API answers 401, and leaves tenant data
 *     readable from cache after logout on a shared machine.
 *
 * Both were found by driving the real stack rather than by reading it,
 * which is exactly why they are asserted here.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../helpers/app.js';

const EMAIL = 'admin@demo.local';
const PASSWORD = 'CambiarEstaClave123!';

describe('http transport', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  afterAll(async () => {
    await testApp.close();
  });

  it('answers the liveness probe without credentials', async () => {
    const response = await testApp.request.get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'ok' });
    expect(typeof response.body.timestamp).toBe('string');
  });

  it('marks a public response as uncacheable', async () => {
    const response = await testApp.request.get('/health');

    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['vary']).toContain('Cookie');
  });

  it('marks an authenticated response as uncacheable', async () => {
    const login = await testApp.request
      .post('/auth/login')
      .send({ email: EMAIL, password: PASSWORD });
    expect(login.status).toBe(200);

    const session = await testApp.request
      .get('/auth/session')
      .set('authorization', `Bearer ${login.body.accessToken as string}`);

    expect(session.status).toBe(200);
    // The one response a browser is most likely to hold on to: it is
    // fetched on every page load and answers 200 for as long as the
    // access token lives.
    expect(session.headers['cache-control']).toBe('no-store');
    expect(session.headers['vary']).toContain('Cookie');
  });

  it('marks an error response as uncacheable too', async () => {
    const response = await testApp.request.get('/moodles');

    // Errors travel through the exception filter rather than a
    // controller, so they have to inherit the header from middleware
    // rather than from the success path.
    expect(response.status).toBe(401);
    expect(response.headers['cache-control']).toBe('no-store');
  });
});
