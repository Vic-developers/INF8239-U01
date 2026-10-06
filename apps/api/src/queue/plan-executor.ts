/**
 * Plan executor.
 *
 * Runs an approved plan against its Moodle instance, one
 * item at a time, inside the tenant scope. This is the
 * only code that writes to Moodle, and it does so through
 * the `LmsAdapter` port — the same seam the planner read
 * through, so preview and execution classify identically.
 *
 * Three properties are load-bearing here:
 *
 *   Idempotency    an item already present is `skipped`,
 *                  not re-created, so a re-run after a
 *                  crash does not duplicate work.
 *   Checkpoints    progress is persisted every N items, so
 *                  a restart resumes rather than restarts.
 *   Compensation   on failure, completed items are undone
 *                  in reverse order, so a half-run plan
 *                  does not leave a half-created course.
 *
 * The durable record of all of it — plan status, item
 * states, job counters, per-item errors — is written to
 * the database as it goes, so a worker restart never
 * loses what already happened.
 *
 * The tenant scope is threaded through every helper
 * explicitly. Storing it on the instance would let two
 * concurrent runs of this singleton clobber each other.
 */

import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { withTenant } from '@mcc/db';
import { jobErrors, jobs, operationPlans, planItems } from '@mcc/db/schema';
import {
  AppError,
  EXPECTED_MOODLE_ERRORS,
  mapMoodleError,
  planOptionsSchema,
  planPolicySchema,
  type JobStatus,
  type PlanItem,
  type PlanKind,
  type PlanStatus,
} from '@mcc/shared';
import { DatabaseService } from '../database/database.module.js';
import { MoodleService, type TenantScope } from '../moodle/moodle.service.js';
import { PLANNERS } from '../plans/plan-planners.js';
import type { LmsAdapter } from '@mcc/shared';

interface LoadedPlan {
  readonly id: string;
  readonly moodleInstanceId: string | null;
  readonly kind: string;
  readonly status: string;
  readonly options: {
    readonly onConflict: string;
    readonly rollback: string;
    readonly checkpointEvery: number;
  };
  readonly policy: {
    readonly rateLimitProfile: string;
    readonly priority: string;
  };
  readonly items: ExecutableItem[];
}

/**
 * A `PlanItem` plus its database row id. The
 * planner reads the item; the executor needs
 * the id to persist the outcome, and the
 * shared type deliberately carries none.
 */
interface ExecutableItem extends PlanItem {
  readonly id: string;
}

@Injectable()
export class PlanExecutor {
  constructor(
    private readonly database: DatabaseService,
    private readonly moodles: MoodleService,
  ) {}

  /**
   * Executes a plan. Called by the worker with the
   * scope recovered from the job record, never from
   * a request.
   */
  async run(input: {
    readonly jobId: string;
    readonly planId: string;
    readonly scope: TenantScope;
  }): Promise<void> {
    const { jobId, planId, scope } = input;

    let adapter: LmsAdapter | null = null;
    let failure: AppError | null = null;

    try {
      // Validate before mutating. A plan that is
      // not approved must not run, and marking it
      // executing first would make the check in
      // loadPlan read the wrong status — which is
      // how a run used to reject itself.
      const plan = await this.loadPlan(planId, scope);
      const instanceId = plan.moodleInstanceId;
      if (!instanceId) {
        throw new AppError({
          code: 'VALIDATION_FAILED',
          message: 'El plan no tiene una instancia de Moodle destino.',
        });
      }

      await this.markRunning(jobId, planId, scope);

      adapter = await this.moodles.openAdapter(instanceId, scope);

      const planner = PLANNERS[plan.kind as PlanKind];
      if (!planner) {
        throw new AppError({
          code: 'VALIDATION_FAILED',
          message: `No existe un planner para el tipo de plan "${plan.kind}".`,
        });
      }

      const onConflict = plan.options.onConflict;
      const checkpointEvery = plan.options.checkpointEvery;

      let processed = 0;
      let succeeded = 0;
      let failed = 0;
      let skipped = 0;

      for (const item of plan.items) {
        if (item.state !== 'pending') {
          // A resumed plan: already-decided items keep
          // their outcome rather than being re-run.
          processed += 1;
          continue;
        }

        const classification = await planner.classify(adapter, item);

        if (classification.state === 'conflict') {
          if (onConflict === 'fail') {
            throw new AppError({
              code: 'MOODLE_CONFLICT',
              message: `Conflicto en "${item.naturalKey}": ya existe con un estado distinto.`,
            });
          }
          skipped += 1;
          processed += 1;
          await this.settleItem(scope, item.id, {
            state: 'skipped',
            desiredHash: classification.desiredHash,
          });
          continue;
        }

        if (classification.state === 'unchanged') {
          skipped += 1;
          processed += 1;
          await this.settleItem(scope, item.id, {
            state: 'skipped',
            moodleId: classification.moodleId,
            desiredHash: classification.desiredHash,
          });
          continue;
        }

        await this.settleItem(scope, item.id, { state: 'running' });

        try {
          const executed = await planner.execute(adapter, item);
          succeeded += 1;
          processed += 1;
          await this.settleItem(scope, item.id, {
            state: 'done',
            moodleId: executed.moodleId,
            desiredHash: classification.desiredHash,
            compensation: compensationFor(plan.kind, executed.moodleId),
          });
        } catch (error) {
          const appError = toAppError(error);
          failed += 1;
          processed += 1;
          await this.settleItem(scope, item.id, {
            state: 'failed',
            errorCode: appError.code,
            errorMessage: appError.message,
          });
          await this.recordError(scope, jobId, item.naturalKey, appError);
        }

        if (processed % checkpointEvery === 0) {
          await this.checkpoint(scope, jobId, processed, succeeded, failed, skipped);
        }
      }

      await this.checkpoint(scope, jobId, processed, succeeded, failed, skipped);

      const finalPlanStatus: PlanStatus =
        failed > 0 ? 'completed_with_errors' : 'completed';
      const finalJobStatus: JobStatus =
        failed > 0 ? 'completed_with_errors' : 'completed';

      await withTenant(this.database.db, scope, async (tx) => {
        await tx
          .update(operationPlans)
          .set({
            status: finalPlanStatus,
            executedAt: new Date(),
            completedAt: new Date(),
          })
          .where(eq(operationPlans.id, planId));
        await tx
          .update(jobs)
          .set({
            status: finalJobStatus,
            finishedAt: new Date(),
            processed,
            succeeded,
            failed,
            skipped,
            checkpointCursor: processed,
          })
          .where(eq(jobs.id, jobId));
      });
    } catch (error) {
      failure = toAppError(error);
    }

    if (failure) {
      const plan = await this.loadPlanQuietly(planId, scope);
      if (adapter && plan?.options.rollback === 'compensating') {
        await this.compensate(scope, jobId, adapter, plan);
      }

      await withTenant(this.database.db, scope, async (tx) => {
        await tx
          .update(operationPlans)
          .set({ status: 'failed', completedAt: new Date() })
          .where(eq(operationPlans.id, planId));
        await tx
          .update(jobs)
          .set({
            status: 'failed',
            finishedAt: new Date(),
            blockedReason: failure?.message ?? null,
          })
          .where(eq(jobs.id, jobId));
      });
    }
  }

  /**
   * Undoes completed items in reverse order. A
   * compensation that itself fails is recorded but
   * does not stop the rest: the goal is to undo as
   * much as possible, not to guarantee an exact
   * reversal.
   */
  private async compensate(
    scope: TenantScope,
    jobId: string,
    adapter: LmsAdapter,
    plan: LoadedPlan,
  ): Promise<void> {
    const completed = await this.completedItems(plan.id, scope);
    for (let index = completed.length - 1; index >= 0; index -= 1) {
      const item = completed[index];
      if (!item) continue;
      const compensation = item.compensation as
        | { kind: string; payload: Record<string, unknown> }
        | null;
      if (!compensation) continue;

      try {
        await runCompensation(adapter, compensation.kind, compensation.payload);
      } catch (error) {
        await this.recordError(
          scope,
          jobId,
          item.naturalKey,
          toAppError(error),
        );
      }
    }
  }

  private async markRunning(
    jobId: string,
    planId: string,
    scope: TenantScope,
  ): Promise<void> {
    await withTenant(this.database.db, scope, async (tx) => {
      await tx
        .update(jobs)
        .set({ status: 'running', startedAt: new Date() })
        .where(eq(jobs.id, jobId));
      await tx
        .update(operationPlans)
        .set({ status: 'executing' })
        .where(eq(operationPlans.id, planId));
    });
  }

  private async loadPlan(planId: string, scope: TenantScope): Promise<LoadedPlan> {
    const plan = await this.loadPlanQuietly(planId, scope);
    if (!plan) {
      throw new AppError({
        code: 'NOT_FOUND',
        message: 'El plan no existe.',
      });
    }
    if (plan.status !== 'approved') {
      throw new AppError({
        code: 'CONFLICT',
        message: `El plan está "${plan.status}", no "approved". Solo un plan aprobado se ejecuta.`,
      });
    }
    return plan;
  }

  private async loadPlanQuietly(
    planId: string,
    scope: TenantScope,
  ): Promise<LoadedPlan | null> {
    return withTenant(this.database.db, scope, async (tx) => {
      const rows = await tx
        .select()
        .from(operationPlans)
        .where(eq(operationPlans.id, planId))
        .limit(1);
      const row = rows[0];
      if (!row) return null;

      const itemRows = await tx
        .select()
        .from(planItems)
        .where(eq(planItems.planId, planId))
        .orderBy(planItems.ordinal);

      const options = planOptionsSchema.parse(row.options);
      const policy = planPolicySchema.parse(row.policy);

      return {
        id: row.id,
        moodleInstanceId: row.moodleInstanceId,
        kind: row.kind,
        status: row.status,
        options: {
          onConflict: options.onConflict,
          rollback: options.rollback,
          checkpointEvery: options.checkpointEvery,
        },
        policy: {
          rateLimitProfile: policy.rateLimitProfile,
          priority: policy.priority,
        },
        items: itemRows.map(toExecutableItem),
      };
    });
  }

  private async completedItems(
    planId: string,
    scope: TenantScope,
  ): Promise<Array<typeof planItems.$inferSelect>> {
    return withTenant(this.database.db, scope, async (tx) =>
      tx
        .select()
        .from(planItems)
        .where(eq(planItems.planId, planId))
        .orderBy(planItems.ordinal),
    );
  }

  private async settleItem(
    scope: TenantScope,
    itemId: string,
    patch: {
      readonly state?: string;
      readonly moodleId?: string;
      readonly desiredHash?: string;
      readonly errorCode?: string;
      readonly errorMessage?: string;
      readonly compensation?: Record<string, unknown>;
    },
  ): Promise<void> {
    await withTenant(this.database.db, scope, async (tx) => {
      await tx
        .update(planItems)
        .set({
          ...(patch.state ? { state: patch.state as never } : {}),
          ...(patch.moodleId !== undefined
            ? { moodleId: patch.moodleId }
            : {}),
          ...(patch.desiredHash !== undefined
            ? { desiredHash: patch.desiredHash }
            : {}),
          ...(patch.errorCode !== undefined
            ? { errorCode: patch.errorCode }
            : {}),
          ...(patch.errorMessage !== undefined
            ? { errorMessage: patch.errorMessage }
            : {}),
          ...(patch.compensation !== undefined
            ? { compensation: patch.compensation }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(planItems.id, itemId));
    });
  }

  private async checkpoint(
    scope: TenantScope,
    jobId: string,
    processed: number,
    succeeded: number,
    failed: number,
    skipped: number,
  ): Promise<void> {
    await withTenant(this.database.db, scope, async (tx) => {
      await tx
        .update(jobs)
        .set({
          processed,
          succeeded,
          failed,
          skipped,
          checkpointCursor: processed,
        })
        .where(eq(jobs.id, jobId));
    });
  }

  private async recordError(
    scope: TenantScope,
    jobId: string,
    naturalKey: string,
    error: AppError,
  ): Promise<void> {
    await withTenant(this.database.db, scope, async (tx) => {
      await tx.insert(jobErrors).values({
        jobId,
        naturalKey,
        code: error.code,
        message: error.message,
        remediation: (error.remediation ?? null) as Record<string, unknown> | null,
        // Never returned by the API; for operators only.
        debugContext: (error.context ?? null) as Record<string, unknown> | null,
        attempts: 1,
      });
    });
  }
}

/** Maps a persisted item row onto the executable form the planner reads. */
function toExecutableItem(row: typeof planItems.$inferSelect): ExecutableItem {
  return {
    id: row.id,
    naturalKey: row.naturalKey,
    targetType: row.targetType as PlanItem['targetType'],
    moodleId: row.moodleId ?? undefined,
    desiredHash: row.desiredHash ?? undefined,
    desired: row.desired as Record<string, unknown>,
    state: row.state as PlanItem['state'],
    attempts: row.attempts,
    errorCode: row.errorCode ?? undefined,
    errorMessage: row.errorMessage ?? undefined,
    compensation: (row.compensation ?? undefined) as PlanItem['compensation'],
  };
}

/** The compensation a completed create records. */
function compensationFor(
  kind: string,
  moodleId: string,
): Record<string, unknown> {
  switch (kind) {
    case 'course.create':
      return { kind: 'course.delete', payload: { moodleId } };
    case 'user.create':
      return { kind: 'user.delete', payload: { moodleId } };
    default:
      return { kind: 'noop', payload: {} };
  }
}

/** Reverses one completed item. */
async function runCompensation(
  adapter: LmsAdapter,
  kind: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const moodleId = String(payload.moodleId ?? '');
  switch (kind) {
    case 'course.delete':
      await adapter.call('core_course_delete_courses', {
        courseids: [moodleId],
      });
      return;
    case 'user.delete':
      await adapter.call('core_user_delete_users', {
        userids: [moodleId],
      });
      return;
    default:
      return;
  }
}

/** Normalises any thrown value into an `AppError`. */
function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;

  const upstream = error as {
    readonly errorcode?: string;
    readonly status?: number;
    readonly message?: string;
  };
  if (
    upstream &&
    (typeof upstream.errorcode === 'string' ||
      typeof upstream.status === 'number')
  ) {
    // An already-present resource is an expected outcome
    // the caller tolerates, never a failure to report.
    if (
      upstream.errorcode &&
      EXPECTED_MOODLE_ERRORS.has(upstream.errorcode)
    ) {
      return new AppError({
        code: 'MOODLE_CONFLICT',
        message: 'El recurso ya existe en Moodle.',
      });
    }
    return mapMoodleError(upstream);
  }

  return new AppError({
    code: 'INTERNAL_ERROR',
    message: 'Ocurrió un error inesperado.',
    context: { reason: error instanceof Error ? error.message : String(error) },
  });
}
