import ts from 'typescript';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    {
      name: 'mcc:ts-compiler',
      enforce: 'pre',
      transform(code, id) {
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
    setupFiles: ['./test/setup-env.ts'],
    include: ['test/e2e/**/*.test.ts'],
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});