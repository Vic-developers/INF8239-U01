/**
 * @mcc/db — schema, connection and Row Level Security helpers.
 *
 * Three schemas in one PostgreSQL instance:
 *   mcc    control plane, source of truth
 *   dw     analytics store, derived from Moodle
 *   audit  append-only, hash-chained log
 */

export {
  createPool,
  createDb,
  createDatabase,
  createPlatformDatabase,
  schema,
} from './client.js';
export type { Database, DbOptions } from './client.js';

export {
  withTenant,
  withTenantReadOnly,
  withPlatformScope,
  hasTenantScope,
  assertRlsEffective,
  assertPlatformRole,
  TENANT_SETTING,
  ACTOR_SETTING,
} from './rls.js';
export type { TenantScope } from './rls.js';

export * from './schema/index.js';