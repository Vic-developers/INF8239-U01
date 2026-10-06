/**
 * Test environment.
 *
 * Loaded before any module under test, because the configuration module validates
 * the environment at import time. Setting it here rather than inside each test
 * file means one place to see what the suite actually runs against.
 *
 * These are development values for a throwaway database. Nothing here is a real
 * secret and none of it may be used outside the test suite.
 */

// Applied before anything under test imports a decorated
// class: the compiler emits `Reflect.metadata(...)` calls
// for constructor injection, and without this polyfill
// those calls are skipped, so Nest resolves every
// dependency as undefined.
import 'reflect-metadata';

const KEY = Buffer.alloc(32, 7).toString('base64');

process.env['NODE_ENV'] = 'test';
process.env['DATABASE_URL'] ??= 'postgresql://mcc_app:mcc_app_local@127.0.0.1:5434/moodle_control_center';
process.env['DATABASE_PLATFORM_URL'] ??=
  'postgresql://mcc_platform:mcc_platform_local@127.0.0.1:5434/moodle_control_center';
// A dedicated Redis database keeps the suite's queues and mock
// Moodle state away from any dev process sharing the server, so an
// in-process worker never competes with a dev worker for a job.
process.env['REDIS_URL'] ??= 'redis://127.0.0.1:6379/2';
process.env['ACCESS_TOKEN_SECRET'] ??= 'test-access-secret-that-is-long-enough-to-pass';
process.env['REFRESH_TOKEN_PEPPER'] ??= 'test-refresh-pepper-value';
process.env['MCC_MASTER_KEY'] ??= KEY;
process.env['ALLOW_MOCK_MOODLE'] ??= 'true';
process.env['LOG_LEVEL'] ??= 'silent';
process.env['COOKIE_SECURE'] ??= 'false';
