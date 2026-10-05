import { defineConfig } from 'drizzle-kit';

/**
 * Drizzle Kit config.
 *
 * Two schema sources, one database: `mcc`/`audit` are control-plane DDL,
 * `dw` is the analytics store. Generated SQL is reviewed before it is applied;
 * `push` exists for local development only.
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: [
    './src/schema/mcc.ts',
    './src/schema/dw.ts',
    './src/schema/audit.ts',
  ],
  out: './migrations',
  migrations: {
    table: '__migrations',
    schema: 'public',
  },
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://mcc:mcc@localhost:5432/moodle_control_center',
  },
  strict: true,
  verbose: true,
});