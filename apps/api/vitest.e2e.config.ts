import { mergeConfig, type UserConfig } from 'vitest/config';
import base from './vitest.config.js';

/**
 * End-to-end profile.
 *
 * Separated from the default run because an e2e test is
 * allowed to be slower, to start real processes, and to
 * assume the infrastructure in `infra/` is up — none of
 * which belongs in the fast inner loop of `pnpm test`.
 *
 * The TypeScript compiler plugin and the setup file are
 * inherited, so both profiles compile decorators the same
 * way; only the file set and the timeouts differ.
 *
 * Until `test/e2e/` has files, the profile passes with no
 * tests rather than failing CI for an empty directory.
 */
const merged = mergeConfig(base, {
  test: {
    name: 'e2e',
    passWithNoTests: true,
    // A full stack boot plus real queue round-trips needs
    // more headroom than an in-process integration test.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
} satisfies UserConfig);

const config = merged as UserConfig & { test: NonNullable<UserConfig['test']> };

// Assigned after the merge rather than inside it: `mergeConfig`
// concatenates arrays, so an `include` given there would be added to
// the inherited one and the e2e run would quietly re-execute every
// integration file as well.
config.test.include = ['test/e2e/**/*.e2e.test.ts'];

export default config;
