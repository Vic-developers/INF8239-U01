# Development Guide

## Quick Start
```bash
# Install deps
pnpm install

# Start infra
docker compose -f infra/compose.dev.yml up -d postgres redis mailpit

# Build
pnpm build

# Dev (API + Web)
pnpm dev
```

## Project Structure
- `apps/api` - NestJS API (main + worker entrypoints)
- `apps/worker` - Worker-specific entry (can run separately)
- `apps/web` - React + Vite frontend
- `packages/shared` - Shared contracts/types
- `packages/db` - DB schemas/migrations/Drizzle
- `packages/ui` - shadcn/ui components
- `packages/config` - Shared config
- `packages/testing` - Test utilities
- `infra/` - Docker compose for dev
- `plugin/moodle/local_moodlecontrolcenter/` - Moodle plugin

## Key Commands
```bash
pnpm build        # Build all
pnpm typecheck    # Typecheck all
pnpm lint         # Lint all
pnpm test         # Test all
pnpm --filter @mcc/api dev
pnpm --filter @mcc/web dev
```

## Architecture Notes
- API and worker share NestJS module graph
- Use `127.0.0.1` not `localhost`
- MockMoodleAdapter for dev (Redis-backed)
- Strict TypeScript, no `any`
- tsc for builds (preserves decorator metadata)
- Vitest with forks/singleFork for isolation

## Environment
- .env for development (never commit)
- See .env.example for required vars
- Test env set in test/setup-env.ts
