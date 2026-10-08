# Moodle Control Center - Architecture

## Overview
Multi-tenant enterprise control plane for administering multiple Moodle LMS instances with admin automation, governance, analytics and AI capabilities.

## Core Principles
- **Enterprise-ready**: Secure, scalable SaaS architecture
- **Multi-tenant isolation**: Strict tenant boundaries with `FORCE ROW LEVEL SECURITY` 
- **Auditability**: All bulk/heavy operations create auditable Jobs
- **Safety**: Mandatory dry-run + explicit confirmation for destructive operations
- **Layer separation**: Clear architectural boundaries with dependency inversion
- **Type safety**: Strict TypeScript, no `any` types

## Tech Stack

### Frontend (apps/web)
- **Framework**: React 18 + TypeScript + Vite
- **Routing**: React Router v6
- **Data fetching**: TanStack Query v5
- **Tables**: TanStack Table v8
- **Forms**: React Hook Form + Zod validation
- **Styling**: Tailwind CSS + shadcn/ui components
- **Icons**: Lucide React
- **Charts**: Recharts
- **Date utilities**: date-fns

### API & Worker (apps/api, apps/worker)
- **Framework**: NestJS v10 with strict TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Cache/Queue**: Redis + BullMQ
- **Logging**: Pino
- **Testing**: Vitest (forks pool, singleFork)

### Shared (packages/)
- **shared**: Contracts, types, schemas
- **db**: Database schemas, migrations, RLS
- **ui**: Shared UI components
- **config**: Shared configuration
- **testing**: Test utilities

## Architecture Layers

### API Layer
```
Controller → Application Service → Moodle Service → Moodle Adapter → Web Service Client
```

- **Controller**: HTTP routing, request validation, response formatting
- **Application Service**: Business logic, orchestration, transaction boundaries
- **Moodle Service**: Domain logic specific to Moodle operations
- **Moodle Adapter**: Implements `LmsAdapter` port (abstraction over Moodle)
- **Web Service Client**: Makes HTTP calls to Moodle Web Services API

### Adapter Pattern
- `LmsAdapter` port defines interface for LMS operations
- `MoodleWebServiceAdapter` implements for live Moodle instances
- `MockMoodleAdapter` implements for development/testing with Redis-backed state
- Mock state stored in Redis: `hash mcc:mock:state:<instanceId>`, field `<kind>:<naturalKey>`

## Multi-Tenancy

### Database-level Isolation
- `FORCE ROW LEVEL SECURITY` enabled on all tenant tables
- 4 PostgreSQL roles with specific permissions
- `mcc_platform` has `BYPASSRLS` only for tenant provisioning/login-time identity lookup/cross-tenant jobs
- All tenant-scoped queries automatically filtered by tenant context

### Token Security
- **Access tokens**: HMAC-SHA256 (not JWT)
- **Refresh tokens**: Opaque SHA-256(pepper||token), rotated on use
- **Family reuse**: Revokes entire token family on reuse detection
- **Password hashing**: scrypt v2
- **Envelope encryption**: AES-256-GCM + versioned DEK + HKDF IV

## Plan Engine

```
OperationPlan → Planner → PlanPreview → dry-run → approve → Job → Executor + compensation log
```

- **OperationPlan**: Serializable plan definition
- **PlanPreview**: Preview before execution (classification differs from persisted `ItemState`)
- **Dry-run**: Mandatory validation without side effects
- **Job**: Auditable unit for bulk/heavy operations
- **Executor**: Runs approved plans with compensation support
- **loadPlan** before `markRunning`; enqueue to BullMQ after transaction commit
- **scopeOf(context)** maps HTTP context to `TenantScope`

## Job System
- All bulk/heavy operations produce auditable Jobs
- BullMQ for job processing with Redis backing
- Idempotency keys for safe retries
- Compensation log for rollback scenarios
- Rate limiting toward Moodle endpoints

## Deployment Architecture
- Monorepo: pnpm workspaces + Turborepo at `C:\Projects\moodle-control-center\`
- Apps: `apps/api`, `apps/worker`, `apps/web`
- Packages: `packages/shared`, `packages/ui`, `packages/db`, `packages/config`, `packages/testing`
- Infrastructure: `infra/` (Docker Compose for dev)
- Moodle plugin: `plugin/moodle/local_moodlecontrolcenter/`

## Integration
- Moodle Web Services API is primary integration
- `local_*` Moodle plugins only used if WS insufficient
- Never fake unsupported capabilities
- Version support: Moodle 4.0 - 5.3 (version selectable per instance)
- Version-aware function resolution

## Development
- API + worker share NestJS module graph, two entrypoints (`main.ts`, `worker-main.ts`)
- Use `127.0.0.1` (not `localhost`) for all connections
- Compile with `tsc` (no tsx/esbuild) for decorator metadata
- Vitest: custom TS-transpile plugin for decorator metadata
- Redis DB 2 for tests, DB 0 for dev
- No real Moodle instances in dev - MockMoodleAdapter only
