/**
 * Per-kind planners.
 *
 * A planner answers one question for one item: given the
 * current state of the target Moodle, what would running this
 * item do? That answer is what a preview shows and what the
 * executor acts on, so the classification lives here rather
 * than being spread across the preview and execute paths.
 *
 * Only the kinds a planner knows how to classify can be
 * previewed. A plan of an unsupported kind is not silently
 * treated as a no-op: the preview reports it as an error,
 * which is the safe failure.
 */

import { createHash } from 'node:crypto';
import { AppError, type LmsAdapter } from '@mcc/shared';
import type { PlanItem, PlanKind } from '@mcc/shared';

/**
 * What a planner would do with one item. This is the
 * preview's vocabulary — `create`/`unchanged`/`conflict` —
 * which is deliberately distinct from the persisted item
 * state (`done`/`skipped`/`failed`): the executor maps
 * one onto the other only once the item has actually run.
 */
export type ClassificationState =
  | 'create'
  | 'update'
  | 'unchanged'
  | 'skipped'
  | 'conflict'
  | 'error';

export interface Classification {
  readonly state: ClassificationState;
  readonly moodleId?: string;
  readonly desiredHash?: string;
  readonly errorCode?: string;
  readonly errorMessage?: string;
}

export interface PlanPlanner {
  readonly kind: PlanKind;
  readonly requiredCapabilities: readonly string[];
  /** What running this item would do, given current state. */
  classify(adapter: LmsAdapter, item: PlanItem): Promise<Classification>;
  /** Runs the mutation. Returns the Moodle id it created. */
  execute(adapter: LmsAdapter, item: PlanItem): Promise<{ moodleId: string }>;
}

interface ExistingResource {
  readonly moodleId: string;
  readonly current: Record<string, unknown>;
}

/**
 * Builds the planner for a "create" kind: a resource is
 * looked up by its natural key, and the desired state is
 * compared with what is already there. Absent means create,
 * identical means unchanged, different means conflict — the
 * optimistic check that stops a plan from silently clobbering
 * a resource someone else changed.
 */
function createPlanner(
  kind: PlanKind,
  requiredCapabilities: readonly string[],
  lookup: (adapter: LmsAdapter, item: PlanItem) => Promise<ExistingResource | null>,
  execute: (adapter: LmsAdapter, item: PlanItem) => Promise<{ moodleId: string }>,
): PlanPlanner {
  return {
    kind,
    requiredCapabilities,
    async classify(adapter, item) {
      const desiredHash = hashOf(item.desired);
      const existing = await lookup(adapter, item);

      if (!existing) {
        return { state: 'create', desiredHash };
      }

      return desiredMatches(existing.current, item.desired)
        ? {
            state: 'unchanged',
            moodleId: existing.moodleId,
            desiredHash,
          }
        : {
            state: 'conflict',
            moodleId: existing.moodleId,
            desiredHash,
          };
    },
    execute,
  };
}

/**
 * Enrolment has no single "is this user enrolled with this
 * role" web service, so the preview cannot classify it ahead
 * of time. It is reported as a create; the executor still
 * treats an already-enrolled user as a skipped, expected
 * outcome rather than a failure, so a re-run stays clean.
 */
function alwaysCreatePlanner(
  kind: PlanKind,
  requiredCapabilities: readonly string[],
  execute: (adapter: LmsAdapter, item: PlanItem) => Promise<{ moodleId: string }>,
): PlanPlanner {
  return {
    kind,
    requiredCapabilities,
    async classify(_adapter, item) {
      return { state: 'create', desiredHash: hashOf(item.desired) };
    },
    execute,
  };
}

/** The planners this build can classify, by plan kind. */
export const PLANNERS: Partial<Record<PlanKind, PlanPlanner>> = {
  'course.create': createPlanner(
    'course.create',
    ['moodle/webservice:create', 'moodle/course:create'],
    async (adapter, item) => {
      const shortname = String(item.desired.shortname ?? '');
      if (!shortname) return null;
      const result = await adapter.call<{
        courses: Array<Record<string, unknown>>;
      }>('core_course_get_courses_by_field', {
        field: 'shortname',
        value: shortname,
      });
      const found = result.courses[0];
      return found
        ? { moodleId: String(found.id), current: found }
        : null;
    },
    async (adapter, item) => {
      // core_course_create_courses answers with a
      // direct array of the created courses, not a
      // wrapper object — unlike the *_by_field
      // reads, which wrap their list.
      const result = await adapter.call<Array<{ id: number }>>(
        'core_course_create_courses',
        { courses: [item.desired] },
      );
      const created = result[0];
      if (!created) {
        throw new AppError({
          code: 'MOODLE_UNREACHABLE',
          message: 'Moodle no creó el curso.',
        });
      }
      return { moodleId: String(created.id) };
    },
  ),

  'user.create': createPlanner(
    'user.create',
    ['moodle/user:create'],
    async (adapter, item) => {
      const email = String(item.desired.email ?? '');
      if (!email) return null;
      const result = await adapter.call<{
        users: Array<Record<string, unknown>>;
      }>('core_user_get_users_by_field', {
        field: 'email',
        value: email,
      });
      const found = result.users[0];
      return found
        ? { moodleId: String(found.id), current: found }
        : null;
    },
    async (adapter, item) => {
      // core_user_create_users answers with a
      // direct array of the created users.
      const result = await adapter.call<Array<{ id: number }>>(
        'core_user_create_users',
        { users: [item.desired] },
      );
      const created = result[0];
      if (!created) {
        throw new AppError({
          code: 'MOODLE_UNREACHABLE',
          message: 'Moodle no creó el usuario.',
        });
      }
      return { moodleId: String(created.id) };
    },
  ),

  'enrolment.create': alwaysCreatePlanner(
    'enrolment.create',
    ['moodle/enrol:manage'],
    async (adapter, item) => {
      await adapter.call('enrol_manual_enrol_user', {
        courseid: item.desired.courseid,
        userid: item.desired.userid,
        roleid: item.desired.roleid,
      });
      return {
        moodleId: `${item.desired.courseid}:${item.desired.userid}`,
      };
    },
  ),
};

/**
 * Whether the desired state already holds. Only the fields the
 * caller asked for are compared, so extra fields Moodle adds to
 * its response (ids, timestamps) do not read as a change.
 */
function desiredMatches(
  current: Record<string, unknown>,
  desired: Record<string, unknown>,
): boolean {
  for (const [key, value] of Object.entries(desired)) {
    if (current[key] !== value) return false;
  }
  return true;
}

/** Stable content hash of a desired state, for conflict detection. */
function hashOf(desired: Record<string, unknown>): string {
  const canonical = JSON.stringify(desired, Object.keys(desired).sort());
  return createHash('sha256').update(canonical).digest('hex');
}
