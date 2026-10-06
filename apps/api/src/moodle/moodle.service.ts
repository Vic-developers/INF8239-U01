/**
 * Moodle instance management.
 *
 * Owns the tenant's registry of LMS instances: registering one
 * (storing its web-service token envelope-encrypted), listing
 * them, and probing one to discover its version, functions and
 * capabilities. Every query runs inside the tenant scope, so a
 * forged instance id from another tenant simply is not found.
 *
 * This service never calls Moodle directly. `openAdapter` hands
 * back a live `LmsAdapter` for the instance, and the plan
 * executor uses that port — the same seam a future Canvas
 * adapter slots into.
 */

import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { withTenant } from '@mcc/db';
import {
  moodleCapabilitySnapshots,
  moodleCredentials,
  moodleInstances,
} from '@mcc/db/schema';
import { createHash } from 'node:crypto';
import {
  AppError,
  isSupportedMoodleVersion,
  parseMoodleVersion,
} from '@mcc/shared';
import type { LmsAdapter } from '@mcc/shared';
import { z } from 'zod';
import { CryptoService } from '../crypto/crypto.service.js';
import { DatabaseService } from '../database/database.module.js';
import { RedisService } from '../redis/redis.service.js';
import type { RequestContext } from '../common/request-context.js';
import { MockMoodleAdapter } from './mock-moodle.adapter.js';

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 3;

/**
 * The two values every tenant-scoped query needs. The HTTP
 * layer derives them from the request context; the worker
 * derives them from the job it is processing. Services take
 * this rather than the request context, so they are usable
 * from both without either knowing about the other.
 */
export interface TenantScope {
  readonly tenantId: string;
  readonly actorId: string;
}

/**
 * Tenant and actor from the request context. The context
 * carries a `SessionUser`, which nests both, so callers
 * never destructure a shape that does not exist.
 */
export function scopeOf(context: RequestContext): TenantScope {
  return {
    tenantId: context.user.tenantId,
    actorId: context.user.user.id,
  };
}

export const createInstanceSchema = z.object({
  name: z.string().min(1).max(128),
  baseUrl: z.string().url(),
  /** Moodle web-service token. Encrypted before it touches the database. */
  token: z.string().min(8).max(2048),
  rateLimitProfile: z.string().min(1).max(64).default('default'),
});
export type CreateInstanceInput = z.infer<typeof createInstanceSchema>;

export interface MoodleInstanceView {
  readonly id: string;
  readonly name: string;
  readonly baseUrl: string;
  readonly status: string;
  readonly moodleVersion: string | null;
  readonly moodleRelease: string | null;
  readonly sitename: string | null;
  readonly rateLimitProfile: string;
  readonly pluginInstalled: boolean;
  readonly lastProbeAt: string | null;
  readonly lastProbeStatus: string;
  readonly lastLatencyP50Ms: number | null;
  readonly createdAt: string;
}

export interface ProbeResultView {
  readonly reachable: boolean;
  readonly version: string;
  readonly release: string;
  readonly sitename: string;
  readonly supported: boolean;
  readonly pluginInstalled: boolean;
  readonly grantedCapabilities: readonly string[];
  readonly deniedCapabilities: readonly string[];
  readonly latencyP50Ms: number;
}

@Injectable()
export class MoodleService {
  constructor(
    private readonly database: DatabaseService,
    private readonly crypto: CryptoService,
    private readonly redis: RedisService,
  ) {}

  async create(
    input: CreateInstanceInput,
    scope: TenantScope,
  ): Promise<MoodleInstanceView> {
    const { tenantId, actorId } = scope;

    return withTenant(this.database.db, { tenantId, actorId, }, async (tx) => {
      // The token is sealed here, so the plaintext exists only in this
      // frame and never in a log, a request body that is echoed, or a row.
      const sealed = this.crypto.seal(input.token);

      try {
        const [instance] = await tx
          .insert(moodleInstances)
          .values({
            tenantId,
            name: input.name,
            baseUrl: input.baseUrl,
            rateLimitProfile: input.rateLimitProfile,
          })
          .returning();

        if (!instance) {
          // Unreachable with Postgres, but the credential
          // insert below reads `instance.id`, so the null
          // case is handled rather than trusted away.
          throw new AppError({
            code: 'INTERNAL_ERROR',
            message: 'No se pudo registrar la instancia.',
          });
        }

        await tx.insert(moodleCredentials).values({
          instanceId: instance.id,
          secretCiphertext: sealed.secretCiphertext,
          iv: sealed.iv,
          authTag: sealed.authTag,
          wrappedDek: sealed.wrappedDek,
          keyVersion: sealed.keyVersion,
          tokenLast4: sealed.last4,
        });

        return toView(instance);
      } catch (error) {
        // A name already taken by another instance of
        // the same tenant is a conflict the caller can
        // resolve, not an internal fault to report.
        if (isDuplicateName(error)) {
          throw new AppError({
            code: 'CONFLICT',
            message: 'Ya existe una instancia con ese nombre.',
            remediation: {
              action: 'Listar instancias',
              href: '/moodles',
            },
          });
        }
        throw error;
      }
    });
  }

  async list(scope: TenantScope): Promise<MoodleInstanceView[]> {
    const { tenantId, actorId } = scope;
    return withTenant(this.database.db, { tenantId, actorId, }, async (tx) => {
      const rows = await tx
        .select()
        .from(moodleInstances)
        .orderBy(moodleInstances.createdAt);
      return rows.map(toView);
    });
  }

  async get(id: string, scope: TenantScope): Promise<MoodleInstanceView> {
    const instance = await this.findOne(id, scope);
    return toView(instance);
  }

  /**
   * Probes the instance: site info for the version, then the
   * capability set of the token account. The discovered facts are
   * persisted, so the capability matrix the UI shows reflects the
   * last successful probe rather than a guess.
   */
  async probe(id: string, scope: TenantScope): Promise<ProbeResultView> {
    const stored = await this.findOne(id, scope);
    const adapter = await this.buildAdapter(id, stored.baseUrl, scope);

    const started = Date.now();
    const siteInfo = await adapter.getSiteInfo();
    const capabilities = await adapter.probeCapabilities();
    const latencyP50Ms = Date.now() - started;

    const parsed = parseMoodleVersion(siteInfo.version);
    const supported = parsed !== null && isSupportedMoodleVersion(parsed);

    const { tenantId, actorId } = scope;
    await withTenant(this.database.db, { tenantId, actorId, }, async (tx) => {
      await tx
        .update(moodleInstances)
        .set({
          moodleVersion: siteInfo.version,
          moodleRelease: siteInfo.release,
          // The build number, not the parsed triple: the column
          // holds the machine-readable version Moodle reports.
          moodleVersionNumber: siteInfo.versionnumber,
          sitename: siteInfo.sitename,
          pluginInstalled: capabilities.probeAvailable,
          lastProbeAt: new Date(),
          lastProbeStatus: 'ok',
          lastLatencyP50Ms: latencyP50Ms,
        })
        .where(eq(moodleInstances.id, id));

      const functions = siteInfo.functions ?? [];
      await tx.insert(moodleCapabilitySnapshots).values({
        instanceId: id,
        // Content hash of the function list, so a later
        // probe can detect that the instance changed.
        functionsHash: hashFunctions(functions),
        functionsJson: functions,
        grantedCapabilities: capabilities.granted,
        deniedCapabilities: capabilities.denied,
        missingRequired: [],
        probeAvailable: capabilities.probeAvailable,
        addedFunctions: [],
        removedFunctions: [],
        probedAt: new Date(),
      });
    });

    return {
      reachable: true,
      version: siteInfo.version,
      release: siteInfo.release,
      sitename: siteInfo.sitename,
      supported,
      pluginInstalled: capabilities.probeAvailable,
      grantedCapabilities: capabilities.granted,
      deniedCapabilities: capabilities.denied,
      latencyP50Ms,
    };
  }

  async remove(id: string, scope: TenantScope): Promise<void> {
    const { tenantId, actorId } = scope;
    await withTenant(this.database.db, { tenantId, actorId, }, async (tx) => {
      // Credentials cascade with the instance, so no orphaned
      // sealed token is left behind.
      await tx.delete(moodleInstances).where(eq(moodleInstances.id, id));
    });
  }

  /**
   * Opens a live adapter for the instance: loads and decrypts the
   * stored token, then builds the adapter the executor will call.
   * Used by the plan executor, never exposed as a route.
   */
  async openAdapter(id: string, scope: TenantScope): Promise<LmsAdapter> {
    const stored = await this.findOne(id, scope);
    return this.buildAdapter(id, stored.baseUrl, scope);
  }

  private async findOne(
    id: string,
    scope: TenantScope,
  ): Promise<typeof moodleInstances.$inferSelect> {
    const { tenantId, actorId } = scope;
    const rows = await withTenant(
      this.database.db,
      { tenantId, actorId, },
      async (tx) =>
        tx
          .select()
          .from(moodleInstances)
          .where(eq(moodleInstances.id, id))
          .limit(1),
    );

    const instance = rows[0];
    if (!instance) {
      throw new AppError({
        code: 'NOT_FOUND',
        message: 'La instancia de Moodle no existe.',
        remediation: { action: 'Listar instancias', href: '/moodles' },
      });
    }
    return instance;
  }

  /**
   * Decrypts the stored token and builds the adapter. The plaintext
   * token exists only for the lifetime of the adapter and is never
   * returned or logged.
   */
  private async buildAdapter(
    id: string,
    baseUrl: string,
    scope: TenantScope,
  ): Promise<LmsAdapter> {
    const token = await this.decryptToken(id, scope);
    // The mock keeps its simulated state in
    // Redis, so it is shared with the worker
    // process that executes plans.
    return new MockMoodleAdapter(
      {
        instanceId: id,
        url: baseUrl,
        token,
        timeoutMs: DEFAULT_TIMEOUT_MS,
        maxRetries: DEFAULT_MAX_RETRIES,
        rateLimitProfileName: 'default',
      },
      this.redis.getClient(),
    );
  }

  /**
   * Decrypts the stored token inside the tenant scope. The plaintext
   * is returned to the caller solely to build the adapter: it is not
   * stored, logged, or returned by any route.
   */
  private async decryptToken(id: string, scope: TenantScope): Promise<string> {
    const { tenantId, actorId } = scope;
    const rows = await withTenant(
      this.database.db,
      { tenantId, actorId, },
      async (tx) =>
        tx
          .select()
          .from(moodleCredentials)
          .where(eq(moodleCredentials.instanceId, id))
          .limit(1),
    );

    const credential = rows[0];
    if (!credential) {
      throw new AppError({
        code: 'NOT_FOUND',
        message: 'La instancia no tiene credenciales registradas.',
        remediation: { action: 'Registrar el token', href: '/moodles' },
      });
    }

    return this.crypto.open({
      secretCiphertext: credential.secretCiphertext,
      iv: credential.iv,
      authTag: credential.authTag,
      wrappedDek: credential.wrappedDek,
      keyVersion: credential.keyVersion,
      last4: credential.tokenLast4,
    });
  }
}

/** Deterministic content hash of a function list, for drift detection. */
function hashFunctions(functions: readonly string[]): string {
  const joined = [...functions].sort().join('\n');
  return createHash('sha256').update(joined).digest('hex');
}

/**
 * Whether a database error is the tenant-scoped
 * unique constraint on instance name. Postgres
 * reports a unique violation as SQLSTATE 23505;
 * the constraint name — carried in the message —
 * tells it apart from any other unique index.
 */
function isDuplicateName(error: unknown): boolean {
  const pgError = error as {
    readonly code?: string;
    readonly constraint_name?: string;
    readonly message?: string;
  };
  if (pgError?.code !== '23505') return false;
  const constraint =
    pgError.constraint_name ?? pgError.message ?? '';
  return constraint.includes('moodle_instances_tenant_name_unique');
}

function toView(row: typeof moodleInstances.$inferSelect): MoodleInstanceView {
  return {
    id: row.id,
    name: row.name,
    baseUrl: row.baseUrl,
    status: row.status,
    moodleVersion: row.moodleVersion,
    moodleRelease: row.moodleRelease,
    sitename: row.sitename,
    rateLimitProfile: row.rateLimitProfile,
    pluginInstalled: row.pluginInstalled,
    lastProbeAt: row.lastProbeAt ? row.lastProbeAt.toISOString() : null,
    lastProbeStatus: row.lastProbeStatus,
    lastLatencyP50Ms: row.lastLatencyP50Ms,
    createdAt: row.createdAt.toISOString(),
  };
}
