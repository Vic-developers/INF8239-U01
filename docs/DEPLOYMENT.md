# Deployment

## Development Environment
### Prerequisites
- Node.js 22+
- pnpm 9.15.4+
- Docker/Docker Compose
- PostgreSQL 16, Redis 7 (via Docker)

### Setup
1. Clone repository
2. `pnpm install`
3. Copy `.env.example` to `.env` and configure
4. Start infrastructure: `docker compose -f infra/compose.dev.yml up -d postgres redis mailpit`
5. Run migrations (via db package scripts)
6. Build: `pnpm build`
7. Dev: `pnpm dev` (or start API/worker separately)

### Services
- Postgres: 127.0.0.1:5434
- Redis: 127.0.0.1:6379 (DB 0 for dev, DB 2 for tests)
- Mailpit UI: 127.0.0.1:8125, SMTP: 127.0.0.1:1125

## Production Considerations
- Use TLS for all external connections
- Proper secret management (not env files in prod)
- Set `COOKIE_SECURE=true`
- Set `TRUST_PROXY=true` if behind proxy/load balancer
- Configure CORS_ORIGINS explicitly
- Database: use managed PostgreSQL with backups
- Redis: managed Redis with persistence
- Run API and worker as separate processes/containers
- Health checks via `/health` endpoint
- Monitoring and logging (structured logs via Pino)

## Build Commands
- `pnpm build` - Build all packages/apps
- `pnpm typecheck` - Type check all
- `pnpm lint` - Lint all
- `pnpm test` - Run tests
- API build: `tsc -p tsconfig.json` (no bundler for decorators)

## Docker
See `infra/compose.dev.yml` for development setup.
