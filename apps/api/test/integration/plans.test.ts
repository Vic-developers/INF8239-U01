/**
 * The plan lifecycle — the product's whole write path.
 *
 * A plan is created, previewed against the live
 * instance (a dry run that writes nothing), approved
 * with an explicit confirmation, executed by the
 * worker, and then previewed again. That last preview
 * is the one that matters: the courses the worker
 * created are now visible, so the same plan reads as
 * `unchanged` rather than creating them a second
 * time — which is idempotency, demonstrated rather
 * than asserted.
 *
 * The worker runs in-process on the test's own Redis
 * database, so the queue round-trip is exercised
 * without a second process.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  clearMockState,
  createTestApp,
  createTestWorker,
  type TestApp,
  type TestWorker,
} from '../helpers/app.js';

const EMAIL = 'admin@demo.local';
const PASSWORD = 'CambiarEstaClave123!';

/** The plan is terminal once it has stopped moving. */
const TERMINAL_STATUSES = new Set([
  'completed',
  'completed_with_errors',
  'failed',
  'cancelled',
]);

describe('plan lifecycle', () => {
  let testApp: TestApp;
  let worker: TestWorker;
  let token: string;
  let instanceId: string;

  beforeAll(async () => {
    testApp = await createTestApp();
    worker = await createTestWorker(testApp.app);
    await clearMockState();

    const login = await testApp.request
      .post('/auth/login')
      .send({ email: EMAIL, password: PASSWORD });
    token = login.body.accessToken as string;

    const created = await testApp.request
      .post('/moodles')
      .set('authorization', `Bearer ${token}`)
      .send({
        name: `Plan Test ${Date.now()}`,
        baseUrl: 'https://moodle.plan.test',
        token: 'mock-token-12345',
        rateLimitProfile: 'default',
      });
    instanceId = created.body.id as string;
  });

  afterAll(async () => {
    if (instanceId !== undefined) {
      await testApp.request
        .delete(`/moodles/${instanceId}`)
        .set('authorization', `Bearer ${token}`);
    }
    await worker.close();
    await testApp.close();
  });

  it('previews two creates, executes them, and is idempotent on re-preview', async () => {
    const auth = { authorization: `Bearer ${token}` };

    const created = await testApp.request
      .post('/plans')
      .set(auth)
      .send({
        kind: 'course.create',
        moodleInstanceId: instanceId,
        origin: 'test',
        items: [
          {
            naturalKey: 'course:MOCK101',
            targetType: 'course',
            desired: {
              shortname: 'MOCK101',
              fullname: 'Curso 101',
              categoryid: 1,
            },
          },
          {
            naturalKey: 'course:MOCK102',
            targetType: 'course',
            desired: {
              shortname: 'MOCK102',
              fullname: 'Curso 102',
              categoryid: 1,
            },
          },
        ],
        policy: { requireApproval: true },
      });
    expect(created.status).toBe(201);
    const planId = created.body.id as string;

    // Dry run: neither course exists yet, so both are
    // creates, and the mock grants every capability the
    // planner needs, so nothing blocks approval.
    const preview = await testApp.request
      .post(`/plans/${planId}/preview`)
      .set(auth);
    expect(preview.status).toBe(200);
    expect(preview.body.counts.total).toBe(2);
    expect(preview.body.counts.create).toBe(2);
    expect(preview.body.counts.unchanged).toBe(0);
    expect(preview.body.missingCapabilities).toEqual([]);

    // Approval carries the explicit confirmation that
    // the impact was reviewed.
    const approved = await testApp.request
      .post(`/plans/${planId}/approve`)
      .set(auth)
      .send({ confirmPreview: true });
    expect(approved.status).toBe(201);
    expect(approved.body.planId).toBe(planId);
    expect(approved.body.job.queue).toBe('mcc.write');

    // The worker picks the job up and executes it.
    const detail = await waitForPlan(
      testApp,
      auth,
      planId,
      15_000,
    );
    expect(detail.body.status).toBe('completed');
    expect(detail.body.items).toHaveLength(2);
    for (const item of detail.body.items) {
      expect(item.state).toBe('done');
      expect(item.moodleId).toBeTruthy();
    }

    // Re-running the preview now sees the courses the
    // worker created, so they are unchanged: the plan
    // is idempotent, not a second create.
    const repreview = await testApp.request
      .post(`/plans/${planId}/preview`)
      .set(auth);
    expect(repreview.status).toBe(200);
    expect(repreview.body.counts.total).toBe(2);
    expect(repreview.body.counts.create).toBe(0);
    expect(repreview.body.counts.unchanged).toBe(2);
  });

  it('refuses approval without the confirmation', async () => {
    const auth = { authorization: `Bearer ${token}` };

    const created = await testApp.request
      .post('/plans')
      .set(auth)
      .send({
        kind: 'course.create',
        moodleInstanceId: instanceId,
        origin: 'test',
        items: [
          {
            naturalKey: `course:NOPE${Date.now()}`,
            targetType: 'course',
            desired: {
              shortname: `NOPE${Date.now()}`,
              fullname: 'No Approval',
              categoryid: 1,
            },
          },
        ],
        policy: { requireApproval: true },
      });
    const planId = created.body.id as string;
    await testApp.request.post(`/plans/${planId}/preview`).set(auth);

    const refused = await testApp.request
      .post(`/plans/${planId}/approve`)
      .set(auth)
      .send({ confirmPreview: false });
    // The refusal is a schema failure, not a bad request shape:
    // `VALIDATION_FAILED` is 422 in the published error table.
    expect(refused.status).toBe(422);
    expect(refused.body.error.code).toBe('VALIDATION_FAILED');
    expect(
      refused.body.error.details.some(
        (issue: { field: string }) => issue.field === 'confirmPreview',
      ),
    ).toBe(true);
  });
});

/** Polls the plan until it reaches a terminal status or the timeout elapses. */
async function waitForPlan(
  testApp: TestApp,
  headers: Record<string, string>,
  planId: string,
  timeoutMs: number,
) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const current = await testApp.request
      .get(`/plans/${planId}`)
      .set(headers);
    if (
      TERMINAL_STATUSES.has(current.body.status) ||
      Date.now() >= deadline
    ) {
      return current;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
}
