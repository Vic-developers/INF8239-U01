import { sql } from 'drizzle-orm';
import { ACTOR_SETTING, TENANT_SETTING } from '@mcc/shared';
import type { Database } from './client.js';

export { TENANT_SETTING, ACTOR_SETTING };

/**
 * Row Level Security scope.
 *
 * RLS reads `app.tenant_id` from the session. That setting is transaction
 * scoped (`SET LOCAL`), so:
 *
 *  1. It must always be set INSIDE a transaction. Outside one it leaks to the
 *     next borrower of the pooled connection.
 *  2. Nothing may read a tenant-scoped table before this runs. A missing
 *     setting yields zero rows rather than all rows, because the policy
 *     compares against `nullif('', '')::uuid` = NULL.
 *
 * `withTenant` is the only supported entry point for tenant data in the API.
 */
export interface TenantScope {
  readonly tenantId: string;
  readonly actorId?: string;
}

/**
 * Runs `callback` inside a transaction with the tenant setting applied.
 * Every tenant-scoped read and write in this product goes through here.
 */
export async function withTenant<T>(
  db: Database,
  scope: TenantScope,
  callback: (tx: Database) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    // SET LOCAL cannot be parameterised, but the value is validated as a UUID
    // before interpolation, which removes the injection surface entirely.
    await tx.execute(sql`select set_config(${TENANT_SETTING}, ${scope.tenantId}, true)`);
    if (scope.actorId !== undefined) {
      await tx.execute(sql`select set_config(${ACTOR_SETTING}, ${scope.actorId}, true)`);
    }
    return callback(tx);
  });
}

/**
 * Read-only variant. Used by reporting paths that must not accidentally mutate
 * control-plane rows. `SET TRANSACTION READ ONLY` makes that a database
 * guarantee, not a convention.
 */
export async function withTenantReadOnly<T>(
  db: Database,
  scope: TenantScope,
  callback: (tx: Database) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`set transaction read only`);
    await tx.execute(sql`select set_config(${TENANT_SETTING}, ${scope.tenantId}, true)`);
    if (scope.actorId !== undefined) {
      await tx.execute(sql`select set_config(${ACTOR_SETTING}, ${scope.actorId}, true)`);
    }
    return callback(tx);
  });
}

/**
 * Platform-level operations: tenant provisioning, identity lookup before a
 * tenant is known, and cross-tenant jobs (full sync, cross-tenant reports).
 *
 * These are impossible for the request role by design. Every table has
 * FORCE ROW LEVEL SECURITY, so a tenant row can only be inserted while that
 * same id is the active scope, and a user can only be read through an existing
 * membership. That guarantee is worth keeping; the bootstrap operations are the
 * exception, so they get their own narrowly-typed connection.
 *
 * `db` here MUST come from `createPlatformDatabase`. Passing a request-role
 * connection here would fail at runtime on a policy violation, which is the
 * intended outcome: the failure mode is loud, not silent.
 */
export async function withPlatformScope<T>(
  db: Database,
  callback: (tx: Database) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    // Records intent for triggers and for auditing, even though the actual
    // bypass comes from the connection role.
    await tx.execute(sql`select set_config('app.platform_scope', 'on', true)`);
    return callback(tx);
  });
}

/**
 * Fails fast when a platform-scoped query is attempted on a connection whose
 * role cannot bypass RLS. Cheaper and clearer than letting the policy raise.
 */
export async function assertPlatformRole(db: Database): Promise<void> {
  const result = await db.execute<{ rolbypassrls: boolean }>(
    sql`select rolbypassrls from pg_roles where rolname = current_user`,
  );
  const row = result[0];
  if (!row?.rolbypassrls) {
    throw new Error(
      'This operation requires the platform database role (BYPASSRLS). ' +
        'The supplied connection is the request role, which is scoped to one tenant.',
    );
  }
}

/** True when the current connection has an active tenant scope. */
export async function hasTenantScope(tx: Database): Promise<boolean> {
  const result = await tx.execute<{ tenant_id: string | null }>(
    sql`select current_setting(${TENANT_SETTING}, true) as tenant_id`,
  );
  const value = result[0]?.tenant_id;
  return typeof value === 'string' && value.length > 0;
}

/**
 * Detects whether the connected role can bypass RLS. The app role must not;
 * `assertRlsEffective` runs at boot so a misconfigured grant fails the process
 * rather than silently leaking tenants.
 */
export async function assertRlsEffective(db: Database): Promise<void> {
  const result = await db.execute<{ rolbypassrls: boolean; rolsuper: boolean }>(
    sql`select rolbypassrls, rolsuper from pg_roles where rolname = current_user`,
  );
  const row = result[0];
  if (!row) {
    throw new Error('Unable to determine the current database role.');
  }
  if (row.rolsuper || row.rolbypassrls) {
    throw new Error(
      'The database role has BYPASSRLS or SUPERUSER. Tenant isolation would be void. ' +
        'Grant the app role only table privileges and never set it as the table owner for RLS-protected tables.',
    );
  }
}