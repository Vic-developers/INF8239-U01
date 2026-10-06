/**
 * Development runner.
 *
 * Compiles with `tsc` and runs the result with `node --watch`.
 *
 * `tsx` is deliberately not used to run the application: it transpiles
 * with esbuild, which does not emit the `design:paramtypes` metadata
 * NestJS constructor injection depends on. Without it every injected
 * dependency is `undefined` at runtime. `tsc` emits the metadata, so
 * the development server behaves exactly like the production build —
 * which is the property that matters, not a fast cold start.
 *
 * Two processes, because they watch different things:
 *   - `tsc --watch` recompiles `src` into `dist` on change
 *   - `node --watch` restarts the server when `dist` changes
 */

import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
// The real compiler entry; `bin/tsc` is a shebang wrapper around it.
const tsc = resolve(root, 'node_modules/typescript/lib/tsc.js');

/** Runs a command, inheriting this process's stdio. */
function run(label, args) {
  // No shell: `process.execPath` lives under "Program Files", and a
  // Windows shell would split it at the space. Spawning node directly
  // passes the path as the application name, which handles spaces.
  const child = spawn(process.execPath, args, {
    cwd: root,
    stdio: 'inherit',
  });

  child.on('exit', (code) => {
    if (shuttingDown) return;
    if (code !== null && code !== 0) {
      console.error(`\n[dev] ${label} exited with code ${code}`);
    }
  });

  return child;
}

let shuttingDown = false;
let server = null;

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of [watch, server]) {
    if (child && !child.killed) child.kill(signal);
  }
  process.exit(0);
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => shutdown(signal));
}

// A one-shot build first, so `node --watch` never starts against a
// missing or half-written `dist`.
console.log('[dev] initial build…');
await new Promise((resolveBuild) => {
  const child = run('build', [tsc, '-p', 'tsconfig.json']);
  child.on('exit', (code) => resolveBuild(code));
});

// Recompile on change.
const watch = run('tsc --watch', [
  tsc,
  '-p',
  'tsconfig.json',
  '--watch',
  '--preserveWatchOutput',
]);

// Run, restarting whenever the compiler rewrites `dist`.
// `--watch-preserve-output` keeps the terminal readable across restarts.
console.log('[dev] starting server…');
server = run('server', [
  '--watch',
  '--watch-preserve-output',
  'dist/main.js',
]);
