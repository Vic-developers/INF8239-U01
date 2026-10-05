/**
 * Development seed.
 *
 * Idempotent: safe to run repeatedly. Two jobs:
 *
 *  1. Materialise the role → permission matrix from `@mcc/shared` into
 *     `mcc.role_permissions`. The catalogue in code is the source of truth; the
 *     table exists so guards can read permissions without loading the bundle, and
 *     so a future custom-role feature has somewhere to live.
 *
 *  2. Create the local development tenant and its first administrator. This is
 *     the bootstrap case that FORCE ROW LEVEL SECURITY makes impossible for the
 *     request role, which is why it runs on the platform connection.
 *
 * Never run against production: it creates a known-credential account.
 */

import { PERMISSIONS, ROLE_PERMISSIONS, ROLES, isPermission } from '@mcc/shared';
import { hashPassword } from '@mcc/shared/node/password';
import { createPlatformDatabase, withPlatformScope } from '../index.js';
import { rolePermissions, tenantMembers, tenants, userRoles, users } from '../schema/mcc.js';

const PLATFORM_URL = process.env['DATABASE_PLATFORM_URL'];

if (!PLATFORM_URL) {
  throw new Error('DATABASE_PLATFORM_URL is required to seed. See .env.example.');
}

interface SeedRoleRow {
  readonly roleKey: string;
  readonly permissionKey: string;
  readonly granted: boolean;
}

/**
 * Flattens the role matrix into rows. Deny entries (leading `-`) become
 * `granted: false`, which is what lets the guard treat deny as authoritative
 * instead of relying on the role definition to stay consistent.
 */
function buildRoleRows(): SeedRoleRow[] {
  const rows: SeedRoleRow[] = [];
  const seen = new Set<string>();

  for (const role of ROLES) {
    for (const entry of ROLE_PERMISSIONS[role]) {
      const isDeny = entry.startsWith('-');
      const permissionKey = isDeny ? entry.slice(1) : entry;

      if (!isPermission(permissionKey)) {
        throw new Error(`Role ${role} references unknown permission ${permissionKey}`);
      }

      const key = `${role}:${permissionKey}:${isDeny}`;
      if (seen.has(key)) continue;
      seen.add(key);

      rows.push({ roleKey: role, permissionKey, granted: !isDeny });
    }
  }

  return rows;
}

async function seedPermissions(tx: Parameters<Parameters<typeof withPlatformScope>[1]>[0]): Promise<number> {
  const rows = buildRoleRows();

  // Replace wholesale: a permission removed from the catalogue must disappear
  // from the table too, otherwise revoking a role would silently not work.
  await tx.delete(rolePermissions);
  await tx.insert(rolePermissions).values(rows);

  const grantedCount = new Set(rows.map((row) => row.permissionKey)).size;
  console.log(`  role_permissions: ${rows.length} rows across ${ROLES.length} roles`);
  console.log(`  distinct permissions in catalogue: ${grantedCount} of ${PERMISSIONS.length}`);
  return rows.length;
}

interface DevAccount {
  readonly tenantSlug: string;
  readonly tenantName: string;
  readonly email: string;
  readonly name: string;
  readonly password: string;
}

const DEV_ACCOUNT: DevAccount = {
  tenantSlug: 'demo',
  tenantName: 'Universidad Demo',
  email: 'admin@demo.local',
  name: 'Administrador Demo',
  // Development-only credential. Overridable so nobody is forced to use it.
  password: process.env['SEED_ADMIN_PASSWORD'] ?? 'CambiarEstaClave123!',
};

async function seedDevTenant(
  tx: Parameters<Parameters<typeof withPlatformScope>[1]>[0],
): Promise<{ tenantId: string; userId: string }> {
  const existingTenant = await tx.select().from(tenants);
  let tenant = existingTenant.find((row) => row.slug === DEV_ACCOUNT.tenantSlug);

  if (!tenant) {
    const [created] = await tx
      .insert(tenants)
      .values({
        slug: DEV_ACCOUNT.tenantSlug,
        name: DEV_ACCOUNT.tenantName,
        status: 'active',
        timezone: 'America/Guayaquil',
        locale: 'es',
      })
      .returning();
    if (!created) throw new Error('Failed to create the development tenant.');
    tenant = created;
    console.log(`  tenant created: ${created.slug} (${created.id})`);
  } else {
    console.log(`  tenant exists: ${tenant.slug} (${tenant.id})`);
  }

  const existingUsers = await tx.select().from(users);
  let user = existingUsers.find((row) => row.email === DEV_ACCOUNT.email);

  if (!user) {
    const passwordHash = await hashPassword(DEV_ACCOUNT.password);
    const [created] = await tx
      .insert(users)
      .values({
        email: DEV_ACCOUNT.email,
        name: DEV_ACCOUNT.name,
        passwordHash,
        status: 'active',
        emailVerifiedAt: new Date(),
      })
      .returning();
    if (!created) throw new Error('Failed to create the development administrator.');
    user = created;
    console.log(`  admin created: ${created.email}`);
  } else {
    console.log(`  admin exists: ${user.email}`);
  }

  const members = await tx.select().from(tenantMembers);
  const isMember = members.some(
    (row) => row.tenantId === tenant.id && row.userId === user.id,
  );
  if (!isMember) {
    await tx.insert(tenantMembers).values({
      tenantId: tenant.id,
      userId: user.id,
      status: 'active',
      joinedAt: new Date(),
    });
    console.log('  membership created');
  }

  const assignments = await tx.select().from(userRoles);
  const isAdmin = assignments.some(
    (row) => row.userId === user.id && row.tenantId === tenant.id && row.roleKey === 'tenant_admin',
  );
  if (!isAdmin) {
    await tx.insert(userRoles).values({
      userId: user.id,
      tenantId: tenant.id,
      roleKey: 'tenant_admin',
      scopeType: 'tenant',
    });
    console.log('  role assigned: tenant_admin');
  }

  return { tenantId: tenant.id, userId: user.id };
}

async function main(): Promise<void> {
  const pool = createPlatformDatabase({ connectionString: PLATFORM_URL });

  try {
    console.log('Seeding Moodle Control Center…\n');

    await withPlatformScope(pool.db, async (tx) => {
      await seedPermissions(tx);
      await seedDevTenant(tx);
    });

    console.log('\nSeed complete.');
    console.log(`  Sign in with: ${DEV_ACCOUNT.email}`);
    if (!process.env['SEED_ADMIN_PASSWORD']) {
      console.log('  Password:    the SEED_ADMIN_PASSWORD default (development only)');
    }
  } finally {
    await pool.close();
  }
}

main().catch((error: unknown) => {
  console.error('\nSeed failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
