/**
 * Mock Moodle adapter.
 *
 * The only adapter until a real Moodle is available to
 * probe against. It implements the `LmsAdapter` port
 * exactly as a real adapter would, so everything above
 * it — the planner, the executor, rate limiting — runs
 * against the same interface production will use.
 *
 * Its state lives in Redis, not in memory. A real
 * Moodle is a centralized source of truth, and the
 * mock has to be too: the API previews a plan and the
 * worker executes it, and those are separate processes.
 * Backing the store with Redis — which both reach — is
 * what makes a re-run idempotent: a course the worker
 * created is visible to the next preview, so it reads
 * as `unchanged` instead of being created twice.
 *
 * State is a Redis hash per instance, fielded by
 * natural key: `mcc:mock:state:<instanceId>` maps
 * `course:MAT101` to `{ moodleId, desired }`.
 *
 * Latency is simulated within the documented range so
 * callers exercise their timeouts the way they would
 * over the network.
 */

import type {
  CapabilityProbeResult,
  LmsAdapter,
  MoodleInstanceConfig,
} from '@mcc/shared';
import {
  MOCK_LATENCY_RANGE_MS,
  createMockCapabilitySet,
  createMockSiteInfo,
  type MoodleSiteInfo,
} from '@mcc/shared';
import { AppError } from '@mcc/shared';
import type { Redis } from 'ioredis';

/** Simulated Moodle state, shared across processes via Redis. */
interface StoredResource {
  readonly moodleId: string;
  readonly desired: Record<string, unknown>;
}

function simulateLatency(): Promise<void> {
  const { min, max } = MOCK_LATENCY_RANGE_MS;
  const ms = min + Math.random() * (max - min);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** A stable positive id, sufficient for a mock. */
function nextMoodleId(): string {
  return String(Math.floor(Math.random() * 1_000_000) + 1);
}

export class MockMoodleAdapter implements LmsAdapter {
  readonly provider = 'moodle' as const;

  constructor(
    private readonly config: MoodleInstanceConfig,
    private readonly redis: Redis,
  ) {}

  async getSiteInfo(): Promise<MoodleSiteInfo> {
    await simulateLatency();
    return createMockSiteInfo(this.config.url);
  }

  async probeCapabilities(): Promise<CapabilityProbeResult> {
    await simulateLatency();
    const { granted, denied } = createMockCapabilitySet();
    return { granted, denied, probeAvailable: true };
  }

  async call<TResponse>(
    fn: string,
    args: Record<string, unknown>,
  ): Promise<TResponse> {
    await simulateLatency();

    switch (fn) {
      case 'core_webservice_get_site_info':
        return createMockSiteInfo(this.config.url) as TResponse;

      case 'local_moodlecontrolcenter_get_my_capabilities': {
        const { granted, denied } = createMockCapabilitySet();
        return { granted, denied } as TResponse;
      }

      case 'core_course_get_courses_by_field': {
        const found = await this.lookup('course', args);
        return {
          courses: found ? [this.toCourseView(found)] : [],
        } as TResponse;
      }

      case 'core_user_get_users_by_field': {
        const found = await this.lookup('user', args);
        return {
          users: found ? [this.toUserView(found)] : [],
        } as TResponse;
      }

      case 'core_course_create_courses':
        return (await this.bulkCreate(
          'course',
          args,
          'courses',
        )) as TResponse;

      case 'core_user_create_users':
        return (await this.bulkCreate(
          'user',
          args,
          'users',
        )) as TResponse;

      case 'enrol_manual_enrol_user': {
        const key = this.enrolmentKey(args);
        await this.storePut('enrolment', key, args);
        return { success: true } as TResponse;
      }

      case 'core_course_delete_courses': {
        const ids = Array.isArray(args.courseids)
          ? (args.courseids as Array<unknown>)
          : [];
        await this.deleteByMoodleId('course', ids.map(String));
        return [] as TResponse;
      }

      case 'core_user_delete_users': {
        const ids = Array.isArray(args.userids)
          ? (args.userids as Array<unknown>)
          : [];
        await this.deleteByMoodleId('user', ids.map(String));
        return [] as TResponse;
      }

      case 'unenrol_user':
        return { success: true } as TResponse;

      case 'local_moodlecontrolcenter_clone_course': {
        const key = this.singleKey(args);
        const stored = await this.storePut('course', key, args);
        return {
          id: Number.parseInt(stored.moodleId, 10),
        } as TResponse;
      }

      default:
        // An unknown function is a hard stop, matching what a
        // real Moodle reports when the service token cannot call it.
        throw new AppError({
          code: 'MOODLE_ACCESS_DENIED',
          message: 'Moodle no habilitó la función web solicitada.',
          cause: `La función ${fn} no está disponible en el mock.`,
        });
    }
  }

  /** Reads the single resource a `by_field` lookup resolves to. */
  private async lookup(
    kind: 'course' | 'user',
    args: Record<string, unknown>,
  ): Promise<StoredResource | undefined> {
    const value = args.value;
    if (typeof value !== 'string' || value.length === 0) return undefined;
    // `storeGet` prefixes the kind itself, so the
    // raw value is passed here — prefixing it twice
    // would look under `course:course:MAT101`.
    return this.storeGet(kind, value);
  }

  private hashKey(): string {
    return `mcc:mock:state:${this.config.instanceId}`;
  }

  private async storeGet(
    kind: string,
    key: string,
  ): Promise<StoredResource | undefined> {
    const raw = await this.redis.hget(this.hashKey(), `${kind}:${key}`);
    return raw ? (JSON.parse(raw) as StoredResource) : undefined;
  }

  /**
   * Records a resource under its natural key. An
   * existing entry is returned unchanged, which is
   * what makes a repeated write idempotent.
   */
  private async storePut(
    kind: string,
    key: string,
    desired: Record<string, unknown>,
  ): Promise<StoredResource> {
    const field = `${kind}:${key}`;
    const existing = await this.storeGet(kind, key);
    if (existing) return existing;

    const stored: StoredResource = { moodleId: nextMoodleId(), desired };
    await this.redis.hset(this.hashKey(), field, JSON.stringify(stored));
    return stored;
  }

  /** The key a single-resource write is stored under. */
  private singleKey(args: Record<string, unknown>): string {
    const value = args.shortname ?? args.username ?? args.email ?? args.value;
    return typeof value === 'string' && value.length > 0
      ? value
      : nextMoodleId();
  }

  private enrolmentKey(args: Record<string, unknown>): string {
    return `${args.courseid}:${args.userid}:${args.roleid}`;
  }

  /**
   * Handles the `create` functions, which take an
   * array under a named parameter (`courses`,
   * `users`). Each element is stored under its own
   * natural key and gets an id back.
   */
  private async bulkCreate(
    kind: 'course' | 'user',
    args: Record<string, unknown>,
    param: string,
  ): Promise<Array<{ id: number }>> {
    const entries = Array.isArray(args[param])
      ? (args[param] as Array<Record<string, unknown>>)
      : [args];

    const results: Array<{ id: number }> = [];
    for (const entry of entries) {
      const key = this.singleKey(entry);
      const stored = await this.storePut(kind, key, entry);
      results.push({ id: Number.parseInt(stored.moodleId, 10) });
    }
    return results;
  }

  /** Removes stored resources by their Moodle id, for compensation. */
  private async deleteByMoodleId(
    kind: string,
    moodleIds: readonly string[],
  ): Promise<void> {
    if (moodleIds.length === 0) return;
    const all = await this.redis.hgetall(this.hashKey());
    const toDelete: string[] = [];
    for (const [field, raw] of Object.entries(all)) {
      if (!field.startsWith(`${kind}:`)) continue;
      const stored = JSON.parse(raw) as StoredResource;
      if (moodleIds.includes(stored.moodleId)) toDelete.push(field);
    }
    if (toDelete.length > 0) {
      await this.redis.hdel(this.hashKey(), ...toDelete);
    }
  }

  private toCourseView(stored: StoredResource): Record<string, unknown> {
    return {
      id: Number.parseInt(stored.moodleId, 10),
      shortname: stored.desired.shortname,
      fullname: stored.desired.fullname,
      ...stored.desired,
    };
  }

  private toUserView(stored: StoredResource): Record<string, unknown> {
    return {
      id: Number.parseInt(stored.moodleId, 10),
      username: stored.desired.username,
      email: stored.desired.email,
      ...stored.desired,
    };
  }
}
