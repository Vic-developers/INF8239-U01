/**
 * Operation Plan contracts.
 *
 * The Plan Engine is the single write path of the product: imports, bulk
 * enrolment, academic period provisioning, course cloning and AI-generated
 * intents all produce a Plan and travel through the same planner, approval and
 * executor. This keeps dry-run, idempotency, audit and rollback uniform.
 */

import { z } from 'zod';

export const PLAN_KINDS = [
  'user.import',
  'user.create',
  'user.suspend',
  'course.create',
  'course.update',
  'course.clone',
  'category.create',
  'enrolment.create',
  'enrolment.unenrol',
  'cohort.members.add',
  'group.members.add',
  'period.provision',
  'moodle.instance.probe',
] as const;

export type PlanKind = (typeof PLAN_KINDS)[number];

export const PLAN_STATUSES = [
  'draft',
  'previewed',
  'awaiting_approval',
  'approved',
  'executing',
  'completed',
  'completed_with_errors',
  'cancelled',
  'failed',
] as const;

export type PlanStatus = (typeof PLAN_STATUSES)[number];

export const ON_CONFLICT = ['skip', 'update', 'fail'] as const;
export type OnConflict = (typeof ON_CONFLICT)[number];

export const ROLLBACK_STRATEGY = ['compensating', 'none'] as const;
export type RollbackStrategy = (typeof ROLLBACK_STRATEGY)[number];

export const ITEM_STATES = [
  'pending',
  'running',
  'done',
  'failed',
  'skipped',
  'conflict',
  'unknown',
] as const;

export type ItemState = (typeof ITEM_STATES)[number];

export const TARGET_TYPE = [
  'user',
  'course',
  'category',
  'enrolment',
  'cohort',
  'group',
  'moodle_instance',
] as const;

export type TargetType = (typeof TARGET_TYPE)[number];

export const planKindSchema = z.enum(PLAN_KINDS);
export const planStatusSchema = z.enum(PLAN_STATUSES);
export const onConflictSchema = z.enum(ON_CONFLICT);
export const rollbackStrategySchema = z.enum(ROLLBACK_STRATEGY);
export const itemStateSchema = z.enum(ITEM_STATES);
export const targetTypeSchema = z.enum(TARGET_TYPE);

/**
 * A single unit of work. `naturalKey` is the idempotency anchor: two items
 * with the same natural key inside a tenant resolve to the same Moodle
 * resource, which is what makes re-running a plan safe.
 */
export const planItemSchema = z.object({
  /** Stable key derived from business identity, e.g. `course:MAT101@2027-01`. */
  naturalKey: z.string().min(1).max(512),
  targetType: targetTypeSchema,
  /** Resource id on the Moodle side, filled after execution. */
  moodleId: z.string().max(64).optional(),
  /** Hash of the fields that matter, used for optimistic conflict detection. */
  desiredHash: z.string().max(128).optional(),
  /** Desired state, validated per kind by the executor's own schema. */
  desired: z.record(z.unknown()),
  state: itemStateSchema.default('pending'),
  attempts: z.number().int().min(0).default(0),
  errorCode: z.string().max(64).optional(),
  errorMessage: z.string().max(1024).optional(),
  /** Actions to undo this item if the plan is rolled back. */
  compensation: z
    .object({
      kind: z.string().min(1).max(128),
      payload: z.record(z.unknown()),
    })
    .optional(),
});
export type PlanItem = z.infer<typeof planItemSchema>;

export const planOptionsSchema = z.object({
  dryRun: z.boolean().default(true),
  onConflict: onConflictSchema.default('skip'),
  rollback: rollbackStrategySchema.default('compensating'),
  /** Persist a cursor after every N items so a restart resumes, not restarts. */
  checkpointEvery: z.number().int().min(1).max(1000).default(25),
});
export type PlanOptions = z.infer<typeof planOptionsSchema>;

export const planPolicySchema = z.object({
  maxRetries: z.number().int().min(0).max(10).default(3),
  rateLimitProfile: z.string().min(1).max(64).default('default'),
  requireApproval: z.boolean().default(true),
  priority: z.enum(['low', 'normal', 'high', 'critical']).default('normal'),
});
export type PlanPolicy = z.infer<typeof planPolicySchema>;

export const operationPlanSchema = z.object({
  kind: planKindSchema,
  /** null means "all instances in the tenant" for cross-instance reports. */
  moodleInstanceId: z.string().uuid().nullable(),
  periodId: z.string().uuid().optional(),
  items: z.array(planItemSchema).min(1).max(50_000),
  options: planOptionsSchema.default({}),
  policy: planPolicySchema.default({}),
  /** Free-form origin: `ui`, `import`, `workflow:<id>`, `schedule`, `ai`. */
  origin: z.string().min(1).max(128).default('ui'),
  /** Idempotency key supplied by the caller; deduplicates repeated submits. */
  idempotencyKey: z.string().min(8).max(255).optional(),
});
export type OperationPlanInput = z.infer<typeof operationPlanSchema>;

/** Counts the planner produces. Sum of the four equals total items. */
export interface PlanCounts {
  readonly total: number;
  readonly create: number;
  readonly update: number;
  readonly unchanged: number;
  readonly skipped: number;
  readonly conflict: number;
  readonly error: number;
}

export const planPreviewSchema = z.object({
  counts: z.object({
    total: z.number().int().min(0),
    create: z.number().int().min(0),
    update: z.number().int().min(0),
    unchanged: z.number().int().min(0),
    skipped: z.number().int().min(0),
    conflict: z.number().int().min(0),
    error: z.number().int().min(0),
  }),
  /** Human-readable impact summary, e.g. "380 cursos, 9820 matrículas". */
  impactSummary: z.array(z.object({ label: z.string(), value: z.string(), tone: z.enum(['neutral', 'warning', 'danger']) })),
  errors: z.array(
    z.object({
      naturalKey: z.string(),
      code: z.string(),
      message: z.string(),
      remediation: z
        .object({ action: z.string(), href: z.string().optional() })
        .optional(),
    }),
  ),
  /** Capabilities the token account must hold for this plan to succeed. */
  requiredCapabilities: z.array(z.string()),
  /** Capabilities the instance reported as missing. Blocks approval. */
  missingCapabilities: z.array(z.string()),
  /** Estimated wall-clock at the instance's configured rate limit. */
  estimatedDurationSeconds: z.number().int().min(0).nullable(),
  /** True when the preview is stale because Moodle data changed after it ran. */
  requiresRevalidation: z.boolean().default(false),
});
export type PlanPreview = z.infer<typeof planPreviewSchema>;

/** Domain-level job status. BullMQ state is transient; this is the durable one. */
export const JOB_STATUSES = [
  'queued',
  'running',
  'paused',
  'completed',
  'completed_with_errors',
  'failed',
  'cancelled',
  'blocked',
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

export const JOB_TYPES = [
  'plan.execute',
  'sync.full',
  'sync.incremental',
  'moodle.health-check',
  'report.run',
  'report.export',
  'workflow.step',
  'analysis.risk',
  'analysis.quality',
  'notification.dispatch',
] as const;

export type JobType = (typeof JOB_TYPES)[number];

export const QUEUE_NAMES = [
  'mcc.write',
  'mcc.bulk',
  'mcc.sync',
  'mcc.analysis',
  'mcc.workflow',
  'mcc.notify',
  'mcc.report',
  'mcc.dlq',
] as const;

export type QueueName = (typeof QUEUE_NAMES)[number];

/** Rate limiter profile per Moodle instance, tuned per deployment. */
export interface RateLimitProfile {
  readonly name: string;
  /** Sustained requests per second toward one Moodle instance. */
  readonly requestsPerSecond: number;
  readonly burst: number;
  readonly concurrency: number;
  /** Share of the budget reserved for interactive work vs sync. */
  readonly interactiveShare: number;
  readonly maxRetries: number;
  readonly timeoutMs: number;
}

export const DEFAULT_RATE_LIMIT_PROFILES: Record<string, RateLimitProfile> = {
  default: {
    name: 'default',
    requestsPerSecond: 4,
    burst: 8,
    concurrency: 4,
    interactiveShare: 0.65,
    maxRetries: 3,
    timeoutMs: 30_000,
  },
  conservative: {
    name: 'conservative',
    requestsPerSecond: 2,
    burst: 4,
    concurrency: 2,
    interactiveShare: 0.7,
    maxRetries: 2,
    timeoutMs: 45_000,
  },
  aggressive: {
    name: 'aggressive',
    requestsPerSecond: 10,
    burst: 20,
    concurrency: 8,
    interactiveShare: 0.6,
    maxRetries: 3,
    timeoutMs: 30_000,
  },
};