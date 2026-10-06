/**
 * Environment configuration.
 *
 * Parsed and validated once at startup. A missing or malformed variable must
 * stop the process before it serves traffic, not surface as a confusing runtime
 * error on the first request that needs it.
 *
 * Secrets are checked for strength only outside development. That check is the
 * difference between "works on my machine" and a deployment where a copy-pasted
 * example secret is serving real tenants.
 */

import { z } from 'zod';
import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Loads the repository-root `.env` regardless of the working directory,
 * because in a monorepo the process usually starts inside the package
 * directory. Real environment variables always win: `override` stays
 * false, so CI and production secrets are never replaced by a checked-in
 * example file.
 *
 * The file is located by walking up from this module rather than by a
 * hard-coded number of `..`, which would break the moment the config file
 * moves one directory deeper.
 */
function loadEnvironmentFile(): void {
  let directory = dirname(fileURLToPath(import.meta.url));

  for (let depth = 0; depth < 8; depth += 1) {
    const candidate = resolve(directory, '.env');
    // dotenv silently ignores a missing file, so existence is checked
    // here to know when to stop climbing.
    if (existsSync(candidate)) {
      loadDotenv({ path: candidate, override: false });
      return;
    }

    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
}

loadEnvironmentFile();

/** 32 bytes base64: the AES-256-GCM key that wraps Moodle tokens. */
const base64Key32 = z
  .string()
  .min(1)
  .refine((value) => {
    try {
      return Buffer.from(value, 'base64').length === 32;
    } catch {
      return false;
    }
  }, 'Must be 32 bytes encoded as base64');

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // ── Server ───────────────────────────────────────────────────────────────
  PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
  /** Bind address. Defaults to loopback so a stray dev server is not exposed. */
  HOST: z.string().min(1).default('127.0.0.1'),
  /** Comma-separated list, or `*` in development. */
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  /** Trust proxy headers only when actually behind a proxy. */
  TRUST_PROXY: z.coerce.boolean().default(false),

  // ── Database ─────────────────────────────────────────────────────────────
  /** Request-serving role. Must be mcc_app: NOBYPASSRLS, no ownership. */
  DATABASE_URL: z.string().url().startsWith('postgresql://'),
  /** Schema owner. Migrations only; never injected into a provider. */
  DATABASE_MIGRATION_URL: z.string().url().startsWith('postgresql://').optional(),
  /**
   * The single BYPASSRLS role. Required because tenant provisioning and
   * login-time identity lookup are impossible for the request role by design.
   */
  DATABASE_PLATFORM_URL: z.string().url().startsWith('postgresql://'),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),

  // ── Redis / queues ───────────────────────────────────────────────────────
  REDIS_URL: z.string().url().default('redis://127.0.0.1:6379'),
  /** Worker concurrency; also the cap on simultaneous Moodle calls. */
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(64).default(4),

  // ── Auth ─────────────────────────────────────────────────────────────────
  /** Signs the short-lived access token. */
  ACCESS_TOKEN_SECRET: z.string().min(32),
  /** Pepper mixed into refresh token hashes, so a database leak is not enough. */
  REFRESH_TOKEN_PEPPER: z.string().min(16),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).default(900),
  /** Absolute session lifetime; refresh cannot extend past it. */
  SESSION_TTL_SECONDS: z.coerce.number().int().min(300).default(2_592_000),
  /** Consecutive failures before an account locks. */
  LOGIN_MAX_ATTEMPTS: z.coerce.number().int().min(3).max(20).default(5),
  LOGIN_LOCK_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),
  /** Secure cookie flags. Off by default so local http development works. */
  COOKIE_SECURE: z.coerce.boolean().default(false),
  COOKIE_DOMAIN: z.string().optional(),

  // ── Encryption ───────────────────────────────────────────────────────────
  /** Master key for Moodle token envelope encryption. */
  MCC_MASTER_KEY: base64Key32,
  /** Active key version; bumping it triggers online re-wrapping. */
  MCC_MASTER_KEY_VERSION: z.coerce.number().int().min(1).default(1),

  // ── Moodle defaults ──────────────────────────────────────────────────────
  /** Outbound HTTP timeout toward a Moodle instance. */
  MOODLE_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120_000).default(30_000),
  MOODLE_RATE_LIMIT_PROFILE: z.string().default('default'),
  /**
   * When true, instances without a real credential are served by the mock
   * adapter. Refused in production: a mock that looks real is how an
   * institution discovers its enrolment data was never written.
   */
  ALLOW_MOCK_MOODLE: z.coerce.boolean().default(true),

  // `silent` is pino's own level and the right one for the test suite.
  LOG_LEVEL: z
    .enum(['silent', 'fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
});

export type AppConfig = z.infer<typeof configSchema> & {
  readonly isProduction: boolean;
  readonly isTest: boolean;
  readonly corsOrigins: readonly string[] | '*';
};

function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = configSchema.safeParse(source);

  if (!parsed.success) {
    // Printed as text rather than through the logger: the logger is configured
    // from this very object, and a bad config is exactly when the developer
    // needs to see plain output in the terminal.
    const lines = parsed.error.issues.map(
      (issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`,
    );
    throw new Error(
      `Invalid environment configuration:\n${lines.join('\n')}\n\n` +
        'Copy .env.example to .env and fill in the missing values.',
    );
  }

  const config = parsed.data;

  if (config.NODE_ENV === 'production') {
    const problems: string[] = [];

    if (config.ALLOW_MOCK_MOODLE) {
      problems.push('ALLOW_MOCK_MOODLE must be false in production.');
    }
    if (config.TRUST_PROXY === false) {
      // Behind a load balancer this makes every request look like it came from
      // the proxy, which destroys per-IP rate limiting.
      console.warn(
        '  Warning: TRUST_PROXY is false. Set it to true when running behind a ' +
          'reverse proxy, or client IPs will all appear as the proxy.',
      );
    }
    for (const [name, value] of [
      ['ACCESS_TOKEN_SECRET', config.ACCESS_TOKEN_SECRET],
      ['REFRESH_TOKEN_PEPPER', config.REFRESH_TOKEN_PEPPER],
    ] as const) {
      if (value.includes('change-me') || value.includes('dev-only')) {
        problems.push(`${name} still holds an example value.`);
      }
    }
    if (!config.COOKIE_SECURE) {
      problems.push('COOKIE_SECURE must be true in production.');
    }

    if (problems.length > 0) {
      throw new Error(
        `Refusing to start in production with an unsafe configuration:\n${problems
          .map((problem) => `  - ${problem}`)
          .join('\n')}`,
      );
    }
  }

  const corsOrigins =
    config.CORS_ORIGINS.trim() === '*'
      ? ('*' as const)
      : config.CORS_ORIGINS.split(',')
          .map((origin) => origin.trim())
          .filter((origin) => origin.length > 0);

  return Object.freeze({
    ...config,
    isProduction: config.NODE_ENV === 'production',
    isTest: config.NODE_ENV === 'test',
    corsOrigins,
  });
}

/** Parsed once per process. */
export const config: AppConfig = loadConfig();

/** Exposed for tests that need to assert on a deliberately broken environment. */
export { loadConfig };
