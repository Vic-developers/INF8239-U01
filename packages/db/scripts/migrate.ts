/**
 * Migration runner.
 *
 * Applies generated SQL plus the hand-written RLS migration in order, tracking
 * what ran in `public.__migrations`. Each file runs inside a transaction with a
 * session-level advisory lock, so concurrent deploys cannot race.
 *
 * Must run as the schema owner (mcc_owner), never as the app role: FORCE ROW
 * LEVEL SECURITY is meaningless if the owner is also the runtime role.
 */

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

/** `scripts/` → `migrations/`, so the runner works from source via tsx. */
const MIGRATIONS_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'migrations',
);

/** Arbitrary but fixed: all deployments contend on the same key. */
const ADVISORY_LOCK_KEY = 4_820_113;

interface MigrationRow {
  readonly name: string;
  readonly applied_at: Date;
}

async function main(): Promise<void> {
  const connectionString =
    process.env['DATABASE_MIGRATION_URL'] ?? process.env['DATABASE_URL'];

  if (!connectionString) {
    throw new Error(
      'DATABASE_MIGRATION_URL or DATABASE_URL is required. Migrations must run as the schema owner.',
    );
  }

  const sql = postgres(connectionString, { max: 1, onnotice: () => undefined });

  try {
    const [{ rolname, rolsuper, rolbypassrls }] = await sql<
      { rolname: string; rolsuper: boolean; rolbypassrls: boolean }[]
    >`select rolname, rolsuper, rolbypassrls from pg_roles where rolname = current_user`;

    console.log(`Migration role: ${rolname}`);
    if (rolsuper || rolbypassrls) {
      console.warn(
        '  Warning: this role is SUPERUSER or has BYPASSRLS. It can bypass tenant isolation, ' +
          'which makes RLS verification meaningless in this environment.',
      );
    }

    // The migration ledger lives in the control-plane schema: `public` is owned
    // by the cluster superuser and is not writable by mcc_owner.
    await sql`
      create schema if not exists mcc authorization mcc_owner
    `;
    await sql`
      create table if not exists mcc.__migrations (
        name text primary key,
        applied_at timestamptz not null default now()
      )
    `;

    const files = (await readdir(MIGRATIONS_DIR))
      .filter((file) => file.endsWith('.sql'))
      .sort();

    if (files.length === 0) {
      console.log('No migrations found.');
      return;
    }

    await sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(${ADVISORY_LOCK_KEY})`;

      const applied = new Map<string, Date>(
        (await tx<MigrationRow[]>`select name, applied_at from mcc.__migrations`).map((row) => [
          row.name,
          row.applied_at,
        ]),
      );

      for (const file of files) {
        if (applied.has(file)) {
          console.log(`  = ${file} (applied ${applied.get(file)?.toISOString()})`);
          continue;
        }

        const contents = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
        process.stdout.write(`  + ${file} ... `);

        await tx.unsafe(contents);
        await tx`insert into mcc.__migrations (name) values (${file})`;

        console.log('ok');
      }
    });

    console.log('\nMigrations up to date.');
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error: unknown) => {
  console.error('\nMigration failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});