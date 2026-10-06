import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Runs before the configuration module is imported by anything under test.
    setupFiles: ['./test/setup-env.ts'],
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    // The RLS and auth suites share one database and one Redis instance; running
    // them in parallel would have them truncating each other's fixtures.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
