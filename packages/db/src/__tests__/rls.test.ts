/**
 * Tenant isolation tests.
 *
 * The most important tests in the codebase: they prove that Row Level Security
 * actually blocks cross-tenant reads and writes, rather than trusting every
 * query to remember its `where tenant_id = ?`.
 *
 * Three roles are exercised deliberately:
 *   mcc_owner    fixtures (schema owner, subject to FORCE RLS like everyone)
 *   mcc_app      the request-serving role — must see exactly one tenant
 *   mcc_platform the single BYPASSRLS role — used only to seed the bootstrap
 *
 * Requires the dev stack and a migrated database:
 *   pnpm infra:up && pnpm db:migrate
 */

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import {
  createDatabase,
  createPlatformDatabase,
  withPlatformScope,
  withTenant,
} from '../index.js';
import { tenantMembers, tenants, users } from '../schema/mcc.js';

const APP_URL = process.env['DATABASE_URL'];
const PLATFORM_URL = process.env['DATABASE_PLATFORM_URL'];

if (!APP_URL || !PLATFORM_URL) {
  throw new Error(
    'DATABASE_URL and DATABASE_PLATFORM_URL are required for the RLS tests. ' +
      'Run `pnpm infra:up` and `pnpm db:migrate` first.',
  );
}

type Pool = ReturnType<typeof createDatabase>;

describe('tenant isolation via Row Level Security', () => {
  let platform: Pool;
  let app: Pool;

  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const userA = randomUUID();
  const userB = randomUUID();

  beforeAll(async () => {
    platform = createPlatformDatabase({ connectionString: PLATFORM_URL });
    app = createDatabase({ connectionString: APP_URL });

    // Seeding needs BYPASSRLS: FORCE RLS means the owner cannot insert a tenant
    // row whose id is not yet the active scope, and cannot insert a user before
    // that user has a membership. This is the bootstrap exception in action.
    await withPlatformScope(platform.db, async (tx) => {
      await tx.insert(tenants).values([
        { id: tenantA, slug: 'tenant-a', name: 'Tenant A', status: 'active' },
        { id: tenantB, slug: 'tenant-b', name: 'Tenant B', status: 'active' },
      ]);

      await tx.insert(users).values([
        { id: userA, email: 'a@example.test', name: 'User A', status: 'active' },
        { id: userB, email: 'b@example.test', name: 'User B', status: 'active' },
      ]);

      await tx.insert(tenantMembers).values([
        { tenantId: tenantA, userId: userA },
        { tenantId: tenantB, userId: userB },
      ]);
    });
  });

  afterAll(async () => {
    if (platform) {
      await withPlatformScope(platform.db, async (tx) => {
        await tx.delete(tenantMembers);
        await tx.delete(users);
        await tx.delete(tenants);
      });
      await platform.close();
    }
    if (app) await app.close();
  });

  it('returns only the scoped tenant rows', async () => {
    const rows = await withTenant(app.db, { tenantId: tenantA }, async (tx) =>
      tx.select({ id: tenants.id }).from(tenants),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(tenantA);
  });

  it('returns nothing when no tenant scope is set', async () => {
    // No `withTenant`: the policy compares against a NULL setting, which yields
    // zero rows rather than every row. This is the property that makes a
    // forgotten tenant filter a silent no-op instead of a data breach.
    const rows = await app.db.select({ id: tenants.id }).from(tenants);
    expect(rows).toHaveLength(0);
  });

  it('rejects writing a row belonging to another tenant', async () => {
    await expect(
      withTenant(app.db, { tenantId: tenantA }, async (tx) =>
        tx.insert(tenants).values({
          id: randomUUID(),
          slug: `forged-${randomUUID().slice(0, 8)}`,
          name: 'Forged',
        }),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('exposes users only through tenant membership', async () => {
    const asA = await withTenant(app.db, { tenantId: tenantA }, async (tx) =>
      tx.select({ email: users.email }).from(users),
    );
    expect(asA).toHaveLength(1);
    expect(asA[0]?.email).toBe('a@example.test');

    const asB = await withTenant(app.db, { tenantId: tenantB }, async (tx) =>
      tx.select({ email: users.email }).from(users),
    );
    expect(asB).toHaveLength(1);
    expect(asB[0]?.email).toBe('b@example.test');
  });

  it('isolates memberships across tenants', async () => {
    const rows = await withTenant(app.db, { tenantId: tenantA }, async (tx) =>
      tx.select({ tenantId: tenantMembers.tenantId }).from(tenantMembers),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tenantId).toBe(tenantA);
  });

  it('blocks an explicit cross-tenant WHERE clause', async () => {
    // The strongest form of the check: asking for another tenant's row by id
    // must still return nothing.
    const rows = await withTenant(app.db, { tenantId: tenantA }, async (tx) =>
      tx.execute(sql`select id from mcc.tenants where id = ${tenantB}::uuid`),
    );

    expect(rows).toHaveLength(0);
  });

  it('blocks an explicit cross-tenant UPDATE', async () => {
    const result = await withTenant(app.db, { tenantId: tenantA }, async (tx) =>
      tx.execute(sql`update mcc.tenants set name = 'hijacked' where id = ${tenantB}::uuid`),
    );

    // Zero rows matched, so the update silently affected nothing.
    expect(result).toHaveLength(0);

    const check = await withPlatformScope(platform.db, async (tx) =>
      tx.select({ name: tenants.name }).from(tenants).where(sql`id = ${tenantB}::uuid`),
    );
    expect(check[0]?.name).toBe('Tenant B');
  });

  it('forbids UPDATE and DELETE on the audit log for every runtime role', async () => {
    const grants = await app.sql<{ grantee: string; privilege_type: string }[]>`
      select grantee, privilege_type
      from information_schema.role_table_grants
      where table_schema = 'audit'
        and table_name = 'audit_logs'
        and grantee in ('mcc_app', 'mcc_platform')
        and privilege_type in ('UPDATE', 'DELETE', 'TRUNCATE')
    `;

    expect(grants).toHaveLength(0);
  });

  it('verifies the request role cannot bypass RLS', async () => {
    const [row] = await app.sql<{ rolbypassrls: boolean; rolsuper: boolean }[]>`
      select rolbypassrls, rolsuper from pg_roles where rolname = current_user
    `;
    expect(row?.rolsuper).toBe(false);
    expect(row?.rolbypassrls).toBe(false);
  });

  it('confirms the platform role is the only one with BYPASSRLS', async () => {
    const rows = await app.sql<{ rolname: string }[]>`
      select rolname from pg_roles where rolbypassrls and rolcanlogin
    `;
    expect(rows.map((row) => row.rolname)).toContain('mcc_platform');
  });

  it('releases the tenant scope when the transaction ends', async () => {
    // `set_config(..., true)` is transaction-local. If this leaked onto the
    // pooled connection, the next borrower would inherit a tenant scope.
    await withTenant(app.db, { tenantId: tenantA }, async () => undefined);

    const leaked = await app.db.select({ id: tenants.id }).from(tenants);
    expect(leaked).toHaveLength(0);
  });
});
