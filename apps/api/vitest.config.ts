import ts from 'typescript';
import { defineConfig } from 'vitest/config';

/**
 * Replaces vitest's default esbuild transform with the
 * real TypeScript compiler.
 *
 * esbuild cannot emit `design:paramtypes`, the metadata
 * Nest reads to resolve constructor injection. Without it
 * the container still instantiates each class, but every
 * `@Injectable` dependency arrives as `undefined`, which
 * surfaces as a 500 at request time rather than a startup
 * error — a failure that is invisible until a request
 * hits the route.
 *
 * The compiler here is the same one the build uses, so a
 * test runs against code shaped exactly like the compiled
 * output, with no separate toolchain and no native
 * binary to install. `reflect-metadata` must be loaded
 * first (see `test/setup-env.ts`) or the emitted
 * `Reflect.metadata` calls are silently skipped.
 */
export default defineConfig({
  plugins: [
    {
      name: 'mcc:ts-compiler',
      enforce: 'pre',
      transform(code, id) {
        // Dependencies under node_modules are already
        // built; transpiling them again would be wasted
        // work and could drop their own metadata.
        if (!id.endsWith('.ts') || id.includes('node_modules')) {
          return null;
        }
        const result = ts.transpileModule(code, {
          fileName: id,
          compilerOptions: {
            module: ts.ModuleKind.ESNext,
            target: ts.ScriptTarget.ES2023,
            experimentalDecorators: true,
            emitDecoratorMetadata: true,
            // Legacy decorators, matching the build: the
            // modern field semantics fight with Nest's
            // parameter decorators.
            useDefineForClassFields: false,
          },
        });
        return {
          code: result.outputText,
          map: result.sourceMapText,
        };
      },
    },
  ],
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
