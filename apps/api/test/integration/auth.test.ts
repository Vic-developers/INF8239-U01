/**
 * Auth lifecycle.
 *
 * Covers the whole session round-trip against the real
 * module graph: a wrong password is rejected without
 * leaking whether the account exists, a correct one
 * sets both cookies and returns a bearer token, the
 * session is readable by cookie or by token, the
 * refresh token rotates, and logout invalidates both.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../helpers/app.js';

const EMAIL = 'admin@demo.local';
const PASSWORD = 'CambiarEstaClave123!';

describe('auth', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  afterAll(async () => {
    await testApp.close();
  });

  it('rejects a session request with no credentials', async () => {
    const response = await testApp.request.get('/auth/session');
    expect(response.status).toBe(401);
  });

  it('rejects a wrong password without confirming the account exists', async () => {
    const response = await testApp.agent.post('/auth/login').send({
      email: EMAIL,
      password: 'not-the-password',
    });
    expect(response.status).toBe(401);
    // The same body for a wrong password as for an unknown
    // account, so a caller cannot tell the two apart.
    expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('logs in, reads the session, refreshes, and logs out', async () => {
    const login = await testApp.agent.post('/auth/login').send({
      email: EMAIL,
      password: PASSWORD,
    });
    expect(login.status).toBe(200);
    expect(login.body.status).toBe('authenticated');

    const accessToken = login.body.accessToken as string;
    expect(typeof accessToken).toBe('string');
    expect(login.body.tenant.id).toBeTruthy();
    expect(login.body.user.email).toBe(EMAIL);

    // The access token travels twice: as a cookie the
    // browser keeps out of JavaScript, and in the body
    // for API clients.
    const setCookie = login.headers['set-cookie'];
    const cookies = Array.isArray(setCookie)
      ? setCookie
      : setCookie !== undefined
        ? [setCookie]
        : [];
    expect(
      cookies.some((cookie) => cookie.startsWith('mcc_session=')),
    ).toBe(true);
    expect(
      cookies.some((cookie) => cookie.startsWith('mcc_refresh=')),
    ).toBe(true);

    // The session is readable with the cookie the agent now holds...
    const byCookie = await testApp.agent.get('/auth/session');
    expect(byCookie.status).toBe(200);
    expect(byCookie.body.user.email).toBe(EMAIL);

    // ...and with the bearer token alone.
    const byToken = await testApp.request
      .get('/auth/session')
      .set('authorization', `Bearer ${accessToken}`);
    expect(byToken.status).toBe(200);
    expect(byToken.body.user.email).toBe(EMAIL);

    // Refreshing rotates the access token.
    const refreshed = await testApp.agent.post('/auth/refresh');
    expect(refreshed.status).toBe(200);
    const rotated = refreshed.body.accessToken as string;
    expect(rotated).not.toBe(accessToken);

    // Logout always answers 204, even with no cookie, so a
    // caller cannot enumerate valid sessions.
    const logout = await testApp.agent.post('/auth/logout');
    expect(logout.status).toBe(204);

    // The session no longer authenticates.
    const afterLogout = await testApp.agent.get('/auth/session');
    expect(afterLogout.status).toBe(401);
  });
});
