/**
 * Moodle instance management.
 *
 * Covers registering an instance (with its web-service
 * token accepted but never echoed back), listing, reading
 * one, probing it to discover the version and capability
 * set, the tenant-scoped unique name, and deregistering.
 *
 * The probe runs against the mock adapter, so the version
 * it reports is the mock's — which is inside the supported
 * range, so a supported instance is what the assertions
 * check for.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../helpers/app.js';

const WEB_SERVICE_TOKEN = 'mock-token-12345';
const EMAIL = 'admin@demo.local';
const PASSWORD = 'CambiarEstaClave123!';

describe('moodle instances', () => {
  let testApp: TestApp;
  let created: { status: number; body: Record<string, unknown> };
  let instanceId: string;
  let instanceName: string;
  let auth: Record<string, string>;

  beforeAll(async () => {
    testApp = await createTestApp();
    // A unique name per run: the tenant scopes instance
    // names, so a leftover from an earlier run must not
    // turn the create below into a conflict.
    instanceName = `Moodle Test ${Date.now()}`;

    const login = await testApp.request
      .post('/auth/login')
      .send({ email: EMAIL, password: PASSWORD });
    expect(login.status).toBe(200);
    auth = { authorization: `Bearer ${login.body.accessToken as string}` };

    created = (await testApp.request
      .post('/moodles')
      .set(auth)
      .send({
        name: instanceName,
        baseUrl: 'https://moodle.test.local',
        token: WEB_SERVICE_TOKEN,
        rateLimitProfile: 'default',
      })) as { status: number; body: Record<string, unknown> };
    expect(created.status).toBe(201);
    instanceId = created.body.id as string;
    expect(typeof instanceId).toBe('string');
  });

  afterAll(async () => {
    // Best-effort cleanup so a re-run starts clean.
    if (instanceId !== undefined) {
      await testApp.request.delete(`/moodles/${instanceId}`).set(auth);
    }
    await testApp.close();
  });

  it('registers an instance without ever returning the token', () => {
    expect(created.body.name).toBe(instanceName);
    expect(created.body.baseUrl).toBe('https://moodle.test.local');
    expect(created.body.rateLimitProfile).toBe('default');
    // The credential is accepted on the way in and absent
    // on the way out — no field of the view carries it, not
    // even a hint, so a response cannot leak it.
    const keys = Object.keys(created.body);
    expect(keys).not.toContain('token');
    expect(keys).not.toContain('tokenLast4');
    expect(JSON.stringify(created.body)).not.toContain(
      WEB_SERVICE_TOKEN,
    );
  });

  it('lists the registered instance', async () => {
    const response = await testApp.request.get('/moodles').set(auth);
    expect(response.status).toBe(200);
    const names = (response.body as Array<{ name: string }>).map(
      (instance) => instance.name,
    );
    expect(names).toContain(instanceName);
  });

  it('reads one instance by id', async () => {
    const response = await testApp.request.get(`/moodles/${instanceId}`).set(auth);
    expect(response.status).toBe(200);
    expect(response.body.id).toBe(instanceId);
    expect(response.body.name).toBe(instanceName);
    expect(response.body.baseUrl).toBe('https://moodle.test.local');
    expect(response.body.rateLimitProfile).toBe('default');
  });

  it('probes the instance and reports a supported version', async () => {
    const response = await testApp.request.post(`/moodles/${instanceId}/probe`).set(auth);
    expect(response.status).toBe(200);
    expect(response.body.reachable).toBe(true);
    expect(typeof response.body.version).toBe('string');
    expect(response.body.version.length).toBeGreaterThan(0);
    // The mock reports Moodle 4.5, inside the 4.0–5.3 range,
    // so a correctly parsed version is supported.
    expect(response.body.supported).toBe(true);
    expect(response.body.pluginInstalled).toBe(true);
    expect(Array.isArray(response.body.grantedCapabilities)).toBe(true);
  });

  it('refuses a second instance with the same name', async () => {
    const response = await testApp.request
      .post('/moodles')
      .set(auth)
      .send({
        name: instanceName,
        baseUrl: 'https://moodle.other.local',
        token: WEB_SERVICE_TOKEN,
        rateLimitProfile: 'default',
      });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('CONFLICT');
  });

  it('deregisters the instance', async () => {
    const response = await testApp.request
      .delete(`/moodles/${instanceId}`)
      .set(auth);
    expect(response.status).toBe(204);

    const gone = await testApp.request.get(`/moodles/${instanceId}`).set(auth);
    expect(gone.status).toBe(404);
  });
});
