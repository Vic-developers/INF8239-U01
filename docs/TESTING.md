# Testing

## Test Framework
- **Runner**: Vitest v2
- **Pool**: `forks` with `singleFork: true` (prevents RLS/auth test interference)
- **Setup**: `test/setup-env.ts` loaded before tests
- **Decorator metadata**: Custom TS-transpile plugin (replaces esbuild) to emit `design:paramtypes`

## Test Categories
- **Unit**: Pure functions, services in isolation (`src/**/*.test.ts`)
- **Integration**: Full module graph with test DB/Redis (`test/integration/**/*.test.ts`)
- **E2E**: End-to-end flows (`test/e2e/**/*.test.ts`)

## Test Configuration
- Redis DB 2 for tests (isolated from dev)
- `LOG_LEVEL=silent` in tests (prevents Nest from exiting silently)
- `singleFork: true` prevents parallel test interference
- Test timeout: 20s, hook timeout: 30s
- E2E: 30s/60s

## Running Tests
```bash
pnpm --filter @mcc/api test          # All API tests
pnpm --filter @mcc/api test --run    # Run once (CI)
pnpm --filter @mcc/api test:e2e      # E2E tests
```

## Test Helpers
- `createTestApp()` - Creates Nest app with full middleware stack
- `createTestWorker(app)` - Creates BullMQ worker for executor
- `clearMockState()` - Clears Redis mock Moodle state
- `createPinoLogger()` - Test logger (never logger:false)

## Important Notes
- Reflect-metadata must be loaded first (in setup-env.ts)
- API+worker share module graph in tests
- Mock Moodle state in Redis shared across processes
- Clear state between tests to ensure isolation
- Integration tests require test DB/Redis running

## Current State
- API unit tests: 17/17 passing (crypto)
- Integration tests require DB/Redis infrastructure
- E2E config created at `apps/api/vitest.e2e.config.ts`
