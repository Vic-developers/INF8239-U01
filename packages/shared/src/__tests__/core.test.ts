import { describe, expect, it } from 'vitest';
import { decodeCursor, encodeCursor, clampLimit, isUuid } from '../core/ids.js';
import { operationPlanSchema, planPreviewSchema } from '../core/plans.js';

describe('cursor encoding', () => {
  it('round-trips a cursor', () => {
    const cursor = { createdAt: '2026-10-05T12:00:00.000Z', id: crypto.randomUUID() };
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });

  it('returns null instead of throwing on garbage input', () => {
    expect(decodeCursor('not-a-cursor')).toBeNull();
    expect(decodeCursor('')).toBeNull();
  });
});

describe('page limits', () => {
  it('clamps to a safe range', () => {
    expect(clampLimit(undefined)).toBe(25);
    expect(clampLimit(0)).toBe(1);
    expect(clampLimit(10_000)).toBe(200);
  });
});

describe('uuid validation', () => {
  it('accepts canonical uuids only', () => {
    expect(isUuid(crypto.randomUUID())).toBe(true);
    expect(isUuid('abc')).toBe(false);
  });
});

describe('operationPlanSchema', () => {
  const validItem = {
    naturalKey: 'course:MAT101@2027-01',
    targetType: 'course' as const,
    desired: { shortname: 'MAT101' },
  };

  it('applies safe defaults', () => {
    const plan = operationPlanSchema.parse({
      kind: 'course.create',
      moodleInstanceId: crypto.randomUUID(),
      items: [validItem],
    });

    expect(plan.options.dryRun).toBe(true);
    expect(plan.options.onConflict).toBe('skip');
    expect(plan.policy.requireApproval).toBe(true);
    expect(plan.items[0]?.state).toBe('pending');
    expect(plan.origin).toBe('ui');
  });

  it('rejects an empty plan', () => {
    const result = operationPlanSchema.safeParse({
      kind: 'course.create',
      moodleInstanceId: crypto.randomUUID(),
      items: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown plan kind so typos cannot reach an executor', () => {
    const result = operationPlanSchema.safeParse({
      kind: 'course.explode',
      moodleInstanceId: crypto.randomUUID(),
      items: [validItem],
    });
    expect(result.success).toBe(false);
  });

  it('caps plan size to protect the preview endpoint', () => {
    const items = Array.from({ length: 50_001 }, (_, index) => ({
      ...validItem,
      naturalKey: `course:C${index}`,
    }));
    const result = operationPlanSchema.safeParse({
      kind: 'course.create',
      moodleInstanceId: crypto.randomUUID(),
      items,
    });
    expect(result.success).toBe(false);
  });
});

describe('planPreviewSchema', () => {
  it('requires capability reporting so missing caps block approval', () => {
    const preview = planPreviewSchema.parse({
      counts: { total: 2, create: 1, update: 0, unchanged: 1, skipped: 0, conflict: 0, error: 0 },
      impactSummary: [{ label: 'Cursos', value: '1', tone: 'neutral' }],
      errors: [],
      requiredCapabilities: ['moodle/course:create'],
      missingCapabilities: [],
      estimatedDurationSeconds: 12,
    });

    expect(preview.counts.create + preview.counts.unchanged).toBe(preview.counts.total);
    expect(preview.missingCapabilities).toHaveLength(0);
  });
});