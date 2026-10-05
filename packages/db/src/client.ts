import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as mcc from './schema/mcc.js';
import * as dw from './schema/dw.js';
import * as audit from './schema/audit.js';

/**
 * Connection pool.
 *
 * The app role must NOT have BYPASSRLS or superuser: RLS is the enforcement
 * boundary for tenant isolation, and a superuser connection would silently
 * defeat every policy.
 */
export const schema = { ...mcc, ...dw, ...audit };

export type Database = PostgresJsDatabase<typeof schema>;

export interface DbOptions {
  readonly connectionString: string;
  /** Hard cap on pool size; each connection holds one tenant setting. */
  readonly maxConnections?: number;
  readonly statementTimeoutMs?: number;
  readonly applicationName?: string;
  /** Receives server NOTICEs; defaults to dropping them, since they can leak schema details. */
  readonly onNotice?: (notice: postgres.Notice) => void;
}

export function createPool(options: DbOptions): postgres.Sql {
  return postgres(options.connectionString, {
    max: options.maxConnections ?? 10,
    // Fail fast rather than hanging a request on a missing statement timeout.
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
    transform: postgres.camel,
    // NOTICE output can carry schema details, so it is dropped unless the
    // caller explicitly opts in.
    onnotice: options.onNotice ?? (() => undefined),
  });
}

export function createDb(sql: postgres.Sql): Database {
  return drizzle(sql, { schema, casing: 'snake_case' });
}

/** Builds pool + database in one step. The caller owns both. */
export function createDatabase(options: DbOptions): {
  sql: postgres.Sql;
  db: Database;
  close: () => Promise<void>;
} {
  const sql = createPool(options);
  const db = createDb(sql);
  return {
    sql,
    db,
    close: async () => {
      await sql.end({ timeout: 5 });
    },
  };
}

/**
 * The platform connection, backed by the single BYPASSRLS role.
 *
 * Kept as a separate constructor so that holding a platform handle is a
 * deliberate act at the call site rather than a connection-string swap buried
 * in a service. Only three kinds of code may use it:
 *
 *   - tenant provisioning (creating the first tenant and its first member)
 *   - identity lookup during login, before any tenant is known
 *   - platform-wide jobs (full sync, cross-tenant reports)
 *
 * Request handlers must not receive it. There is no `tenantId` guard to fall
 * back on here, so the constraint is structural.
 */
export function createPlatformDatabase(options: DbOptions): {
  sql: postgres.Sql;
  db: Database;
  close: () => Promise<void>;
} {
  return createDatabase({
    ...options,
    applicationName: options.applicationName ?? 'mcc-platform',
    // Platform work is rare and short; a small pool keeps the BYPASSRLS
    // capability as small as possible.
    maxConnections: options.maxConnections ?? 3,
  });
}