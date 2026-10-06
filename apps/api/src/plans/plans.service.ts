/**
 * Plan engine — the single write path of the product.
 *
 * Every bulk or heavy operation becomes an
 * `OperationPlan` that travels through the same
 * four steps: create, preview, approve, execute.
 * That uniformity is what makes dry-run,
 * idempotency, audit and rollback uniform too —
 * a new operation kind does not invent a new
 * pipeline, it registers a planner.
 *
 *   create    validates and persists the plan and
 *              its items. Nothing touches Moodle.
 *   preview   classifies every item against the
 *              live instance and reports the impact.
 *              Still nothing is written.
 *   approve   is the explicit confirmation that a
 *              destructive operation requires. It
 *              records a durable job and hands it
 *              to the queue; the API does not run
 *              the plan itself.
 *
 * The executor lives in the worker process, so a
 * long plan never holds an HTTP request open.
 */

import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { withTenant } from '@mcc/db';
import { jobs, operationPlans, planItems } from '@mcc/db/schema';
import {
  AppError,
  operationPlanSchema,
  planOptionsSchema,
  planPolicySchema,
  planPreviewSchema,
  DEFAULT_RATE_LIMIT_PROFILES,
  type JobType,
  type OperationPlanInput,
  type PlanCounts,
  type PlanItem,
  type PlanPreview,
  type PlanStatus,
} from '@mcc/shared';
import { z } from 'zod';
import { DatabaseService } from '../database/database.module.js';
import { MoodleService, type TenantScope } from '../moodle/moodle.service.js';
import { QueueProducer, type PlanExecutionMessage } from '../queue/producer.js';
import { WRITE_QUEUE } from '../queue/queue-name.js';
import { PLANNERS } from './plan-planners.js';

export const approvePlanSchema = z.object({
  // Confirms the operator has read the preview.
  confirmPreview: z.boolean().refine((value) => value === true, {
    message: 'Debes confirmar que revisaste el impacto antes de aprobar.',
  }),
});

@Injectable()
export class PlansService {
  constructor(
    private readonly database: DatabaseService,
    private readonly moodles: MoodleService,
    private readonly queue: QueueProducer,
  ) {}

  async create(
    input: OperationPlanInput,
    scope: TenantScope,
  ): Promise<CreatedPlan> {
    const parsed = operationPlanSchema.parse(input);

    return withTenant(this.database.db, scope, async (tx) => {
      // An idempotency key turns a retried submit
      // into a read: the same plan comes back rather
      // than a second copy being queued.
      if (parsed.idempotencyKey) {
        const existing = await tx
          .select({ id: operationPlans.id })
          .from(operationPlans)
          .where(eq(operationPlans.idempotencyKey, parsed.idempotencyKey))
          .limit(1);
        if (existing[0]) {
          return { id: existing[0].id, idempotent: true as const };
        }
      }

      const status: PlanStatus = parsed.policy.requireApproval
        ? 'awaiting_approval'
        : 'draft';

      const [plan] = await tx
        .insert(operationPlans)
        .values({
          tenantId: scope.tenantId,
          moodleInstanceId: parsed.moodleInstanceId,
          kind: parsed.kind,
          status,
          options: parsed.options,
          policy: parsed.policy,
          origin: parsed.origin,
          idempotencyKey: parsed.idempotencyKey ?? null,
          createdBy: scope.actorId,
        })
        .returning({ id: operationPlans.id });

      if (!plan) {
        throw new AppError({
          code: 'INTERNAL_ERROR',
          message: 'No se pudo registrar el plan.',
        });
      }

      await tx.insert(planItems).values(
        parsed.items.map((item, index) => ({
          planId: plan.id,
          ordinal: index,
          naturalKey: item.naturalKey,
          targetType: item.targetType,
          moodleId: item.moodleId ?? null,
          desiredHash: item.desiredHash ?? null,
          desired: item.desired,
          state: item.state,
          attempts: item.attempts,
          errorCode: item.errorCode ?? null,
          errorMessage: item.errorMessage ?? null,
          compensation: (item.compensation ?? null) as Record<
            string,
            unknown
          > | null,
        })),
      );

      return { id: plan.id, idempotent: false as const };
    });
  }

  /**
   * Classifies every item against the live instance
   * and reports the impact. This is the dry run: it
   * reads Moodle and writes the preview to the plan,
   * but executes nothing.
   */
  async preview(id: string, scope: TenantScope): Promise<PlanPreview> {
    const plan = await this.loadPlan(id, scope);
    const planner = PLANNERS[plan.kind as keyof typeof PLANNERS];
    if (!planner) {
      throw new AppError({
        code: 'VALIDATION_FAILED',
        message: `No existe un planner para el tipo de plan "${plan.kind}".`,
      });
    }

    const adapter = plan.moodleInstanceId
      ? await this.moodles.openAdapter(plan.moodleInstanceId, scope)
      : null;
    if (!adapter) {
      throw new AppError({
        code: 'VALIDATION_FAILED',
        message: 'El plan no tiene una instancia de Moodle destino.',
      });
    }

    const capabilities = await adapter.probeCapabilities();

    const counts = {
      total: plan.items.length,
      create: 0,
      update: 0,
      unchanged: 0,
      skipped: 0,
      conflict: 0,
      error: 0,
    };
    const errors: Array<{
      naturalKey: string;
      code: string;
      message: string;
    }> = [];

    for (const item of plan.items) {
      try {
        const classification = await planner.classify(adapter, item);
        switch (classification.state) {
          case 'create':
            counts.create += 1;
            break;
          case 'unchanged':
            counts.unchanged += 1;
            break;
          case 'conflict':
            counts.conflict += 1;
            break;
          case 'skipped':
            counts.skipped += 1;
            break;
          default:
            counts.error += 1;
        }
      } catch (error) {
        counts.error += 1;
        const appError = error instanceof AppError ? error : null;
        errors.push({
          naturalKey: item.naturalKey,
          code: appError?.code ?? 'PREVIEW_FAILED',
          message: appError?.message ?? 'No se pudo evaluar el elemento.',
        });
      }
    }

    const profile =
      DEFAULT_RATE_LIMIT_PROFILES[plan.policy.rateLimitProfile] ??
      DEFAULT_RATE_LIMIT_PROFILES.default;
    const requestsPerSecond = profile?.requestsPerSecond ?? 4;
    const estimatedDurationSeconds = Math.ceil(
      counts.total / requestsPerSecond,
    );

    const preview = planPreviewSchema.parse({
      counts,
      impactSummary: summarize(plan.kind, counts),
      errors,
      requiredCapabilities: [...planner.requiredCapabilities],
      missingCapabilities: planner.requiredCapabilities.filter(
        (capability) => !capabilities.granted.includes(capability),
      ),
      estimatedDurationSeconds,
      requiresRevalidation: false,
    });

    await withTenant(this.database.db, scope, async (tx) => {
      await tx
        .update(operationPlans)
        .set({
          status: 'previewed',
          preview: preview as Record<string, unknown>,
          previewedAt: new Date(),
        })
        .where(eq(operationPlans.id, id));
    });

    return preview;
  }

  /**
   * The explicit confirmation step. Records a durable
   * job, hands it to the queue, and returns the job —
   * the plan itself runs in the worker process.
   */
  async approve(id: string, scope: TenantScope): Promise<ApprovedPlan> {
    const plan = await this.loadPlan(id, scope);

    if (plan.status !== 'previewed' && plan.status !== 'awaiting_approval') {
      throw new AppError({
        code: 'CONFLICT',
        message: `El plan está "${plan.status}". Solo un plan previewado puede aprobarse.`,
      });
    }

    const priority = priorityOf(plan.policy.priority);

    // The plan is marked approved and its job is
    // recorded in one transaction that commits
    // before anything is queued. Enqueueing
    // inside that transaction would publish the
    // job to Redis while the plan still reads
    // as unapproved, and a worker polling that
    // quickly would reject it — a race the
    // two-step order closes.
    const job = await withTenant(this.database.db, scope, async (tx) => {
      const [created] = await tx
        .insert(jobs)
        .values({
          tenantId: scope.tenantId,
          planId: plan.id,
          type: 'plan.execute' as JobType,
          queue: WRITE_QUEUE,
          status: 'queued',
          priority,
          total: plan.items.length,
          createdBy: scope.actorId,
        })
        .returning({
          id: jobs.id,
          type: jobs.type,
          queue: jobs.queue,
          status: jobs.status,
          total: jobs.total,
        });

      if (!created) {
        throw new AppError({
          code: 'INTERNAL_ERROR',
          message: 'No se pudo registrar el trabajo.',
        });
      }

      await tx
        .update(operationPlans)
        .set({
          status: 'approved',
          approvedBy: scope.actorId,
          approvedAt: new Date(),
        })
        .where(eq(operationPlans.id, plan.id));

      return created;
    });

    // Queued only once the approval is durable.
    const message: PlanExecutionMessage = {
      jobId: job.id,
      planId: plan.id,
      tenantId: scope.tenantId,
      actorId: scope.actorId,
    };
    const bullJobId = await this.queue.enqueuePlanExecution(message, priority);

    await withTenant(this.database.db, scope, async (tx) => {
      await tx.update(jobs).set({ bullJobId }).where(eq(jobs.id, job.id));
    });

    return {
      planId: plan.id,
      job: {
        id: job.id,
        type: job.type,
        queue: job.queue,
        status: job.status,
        total: job.total,
      },
    };
  }

  async cancel(id: string, scope: TenantScope): Promise<void> {
    const plan = await this.loadPlan(id, scope);

    if (
      plan.status !== 'draft' &&
      plan.status !== 'awaiting_approval' &&
      plan.status !== 'previewed'
    ) {
      throw new AppError({
        code: 'CONFLICT',
        message: `El plan está "${plan.status}". Solo un plan sin ejecutar puede cancelarse.`,
      });
    }

    await withTenant(this.database.db, scope, async (tx) => {
      await tx
        .update(operationPlans)
        .set({ status: 'cancelled', cancelledAt: new Date() })
        .where(eq(operationPlans.id, id));
    });
  }

  async list(scope: TenantScope): Promise<Array<PlanSummary>> {
    return withTenant(this.database.db, scope, async (tx) => {
      const rows = await tx
        .select({
          id: operationPlans.id,
          kind: operationPlans.kind,
          status: operationPlans.status,
          origin: operationPlans.origin,
          createdAt: operationPlans.createdAt,
        })
        .from(operationPlans)
        .orderBy(operationPlans.createdAt);
      return rows.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
      }));
    });
  }

  async get(id: string, scope: TenantScope): Promise<PlanDetail> {
    return withTenant(this.database.db, scope, async (tx) => {
      const rows = await tx
        .select()
        .from(operationPlans)
        .where(eq(operationPlans.id, id))
        .limit(1);
      const row = rows[0];
      if (!row) {
        throw new AppError({
          code: 'NOT_FOUND',
          message: 'El plan no existe.',
        });
      }

      const items = await tx
        .select()
        .from(planItems)
        .where(eq(planItems.planId, id))
        .orderBy(planItems.ordinal);

      return {
        id: row.id,
        kind: row.kind,
        status: row.status,
        moodleInstanceId: row.moodleInstanceId,
        origin: row.origin,
        options: row.options as Record<string, unknown>,
        policy: row.policy as Record<string, unknown>,
        preview: (row.preview ?? null) as Record<string, unknown> | null,
        createdAt: row.createdAt.toISOString(),
        items: items.map((item) => ({
          naturalKey: item.naturalKey,
          targetType: item.targetType,
          state: item.state,
          moodleId: item.moodleId,
          errorCode: item.errorCode,
          errorMessage: item.errorMessage,
        })),
      };
    });
  }

  private async loadPlan(
    id: string,
    scope: TenantScope,
  ): Promise<LoadedPlan> {
    const rows = await withTenant(this.database.db, scope, async (tx) => {
      const plans = await tx
        .select()
        .from(operationPlans)
        .where(eq(operationPlans.id, id))
        .limit(1);
      const plan = plans[0];
      if (!plan) return null;

      const items = await tx
        .select()
        .from(planItems)
        .where(eq(planItems.planId, id))
        .orderBy(planItems.ordinal);

      const options = planOptionsSchema.parse(plan.options);
      const policy = planPolicySchema.parse(plan.policy);

      return {
        id: plan.id,
        tenantId: plan.tenantId,
        moodleInstanceId: plan.moodleInstanceId,
        kind: plan.kind,
        status: plan.status as PlanStatus,
        options: {
          onConflict: options.onConflict,
          rollback: options.rollback,
          checkpointEvery: options.checkpointEvery,
        },
        policy: {
          rateLimitProfile: policy.rateLimitProfile,
          priority: policy.priority,
        },
        items: items.map((item) => ({
          naturalKey: item.naturalKey,
          targetType: item.targetType as PlanItem['targetType'],
          desired: item.desired as Record<string, unknown>,
          state: item.state as PlanItem['state'],
          attempts: item.attempts,
        })),
      };
    });

    if (!rows) {
      throw new AppError({
        code: 'NOT_FOUND',
        message: 'El plan no existe.',
      });
    }
    return rows;
  }
}

interface LoadedPlan {
  readonly id: string;
  readonly tenantId: string;
  readonly moodleInstanceId: string | null;
  readonly kind: string;
  readonly status: PlanStatus;
  readonly options: {
    readonly onConflict: string;
    readonly rollback: string;
    readonly checkpointEvery: number;
  };
  readonly policy: {
    readonly rateLimitProfile: string;
    readonly priority: string;
  };
  readonly items: Array<{
    readonly naturalKey: string;
    readonly targetType: PlanItem['targetType'];
    readonly desired: Record<string, unknown>;
    readonly state: PlanItem['state'];
    readonly attempts: number;
  }>;
}

export interface CreatedPlan {
  readonly id: string;
  readonly idempotent: boolean;
}

export interface ApprovedPlan {
  readonly planId: string;
  readonly job: {
    readonly id: string;
    readonly type: string;
    readonly queue: string;
    readonly status: string;
    readonly total: number;
  };
}

export interface PlanSummary {
  readonly id: string;
  readonly kind: string;
  readonly status: string;
  readonly origin: string;
  readonly createdAt: string;
}

export interface PlanDetail {
  readonly id: string;
  readonly kind: string;
  readonly status: string;
  readonly moodleInstanceId: string | null;
  readonly origin: string;
  readonly options: Record<string, unknown>;
  readonly policy: Record<string, unknown>;
  readonly preview: Record<string, unknown> | null;
  readonly createdAt: string;
  readonly items: Array<{
    readonly naturalKey: string;
    readonly targetType: string;
    readonly state: string;
    readonly moodleId: string | null;
    readonly errorCode: string | null;
    readonly errorMessage: string | null;
  }>;
}

/** Operator-facing impact summary, one line per effect. */
function summarize(
  kind: string,
  counts: PlanCounts,
): Array<{ label: string; value: string; tone: 'neutral' | 'warning' | 'danger' }> {
  const lines: Array<{
    label: string;
    value: string;
    tone: 'neutral' | 'warning' | 'danger';
  }> = [];

  if (counts.create > 0) {
    lines.push({
      label: labelFor(kind, 'create'),
      value: String(counts.create),
      tone: kind.includes('delete') || kind.includes('unenrol')
        ? 'danger'
        : 'neutral',
    });
  }
  if (counts.unchanged > 0) {
    lines.push({
      label: 'Sin cambios',
      value: String(counts.unchanged),
      tone: 'neutral',
    });
  }
  if (counts.conflict > 0) {
    lines.push({
      label: 'Conflictos',
      value: String(counts.conflict),
      tone: 'warning',
    });
  }
  if (counts.error > 0) {
    lines.push({
      label: 'Errores de evaluación',
      value: String(counts.error),
      tone: 'danger',
    });
  }
  return lines;
}

function labelFor(kind: string, action: 'create'): string {
  switch (kind) {
    case 'course.create':
      return 'Cursos a crear';
    case 'user.create':
      return 'Usuarios a crear';
    case 'enrolment.create':
      return 'Matrículas a añadir';
    default:
      return `Elementos a ${action}`;
  }
}

function priorityOf(priority: string): number {
  switch (priority) {
    case 'critical':
      return 100;
    case 'high':
      return 50;
    case 'low':
      return 1;
    default:
      return 10;
  }
}
