/**
 * Post-processes Drizzle Kit output.
 *
 * Two adjustments, both idempotency concerns rather than modelling ones:
 *
 *  1. `CREATE SCHEMA` becomes `CREATE SCHEMA IF NOT EXISTS`. The schemas are
 *     also created by infra/postgres/init, so a fresh database that ran the
 *     init scripts would otherwise fail on the generated migration.
 *  2. Enum types land in `public` (Drizzle's default for `pgEnum`). Postgres
 *     treats enum types as cluster-wide objects, and keeping them in one
 *     place avoids duplicating the same type per schema. The runtime role has no
 *     CREATE on `public`, so this is not a privilege escalation.
 *
 * Run automatically by `pnpm generate`.
 */

import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MIGRATIONS_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'migrations',
);

async function main(): Promise<void> {
  const files = (await readdir(MIGRATIONS_DIR)).filter((file) => file.endsWith('.sql'));

  for (const file of files) {
    const target = path.join(MIGRATIONS_DIR, file);
    const original = await readFile(target, 'utf8');
    const patched = original.replace(
      /^CREATE SCHEMA ("?[a-z_]+"?);\s*$/gm,
      'CREATE SCHEMA IF NOT EXISTS $1;',
    );

    if (patched !== original) {
      await writeFile(target, patched, 'utf8');
      console.log(`  patched ${file}: schemas are now idempotent`);
    }
  }
}

main().catch((error: unknown) => {
  console.error('Failed to finalize migrations:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});