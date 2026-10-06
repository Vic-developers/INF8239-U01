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

const KEY = Buffer.alloc(32, 7).toString('base64');

process.env['NODE_ENV'] = 'test';
process.env['DATABASE_URL'] ??= 'postgresql://mcc_app:mcc_app_local@localhost:5434/moodle_control_center';
process.env['DATABASE_PLATFORM_URL'] ??=
  'postgresql://mcc_platform:mcc_platform_local@localhost:5434/moodle_control_center';
process.env['REDIS_URL'] ??= 'redis://127.0.0.1:6379';
process.env['ACCESS_TOKEN_SECRET'] ??= 'test-access-secret-that-is-long-enough-to-pass';
process.env['REFRESH_TOKEN_PEPPER'] ??= 'test-refresh-pepper-value';
process.env['MCC_MASTER_KEY'] ??= KEY;
process.env['ALLOW_MOCK_MOODLE'] ??= 'true';
process.env['LOG_LEVEL'] ??= 'silent';
process.env['COOKIE_SECURE'] ??= 'false';
