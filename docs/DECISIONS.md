# Architecture Decision Records (ADRs)

## ADR-001: Monorepo Structure
**Status**: Accepted

**Context**: Need to manage API, worker, web, shared packages, and Moodle plugin together with consistent tooling.

**Decision**: Use pnpm workspaces + Turborepo monorepo at root `C:\Projects\moodle-control-center\` with apps/, packages/, infra/, plugin/ directories.

**Consequences**: Shared types/contracts between API/web, consistent versioning, simplified dependency management. Slightly more complex local setup.

## ADR-002: NestJS for API/Worker
**Status**: Accepted

**Context**: Need enterprise-grade backend with DI, modules, guards, decorators, strong TypeScript support.

**Decision**: Use NestJS v10 for both API and worker, sharing the same module graph.

**Consequences**: Code reuse, consistent patterns. Two entrypoints: main.ts and worker-main.ts.

## ADR-003: Adapter Pattern for LMS Integration
**Status**: Accepted

**Context**: Must support real Moodle (via Web Services) and mock for dev/testing. Need abstraction for future LMS support.

**Decision**: `LmsAdapter` port with `MoodleWebServiceAdapter` and `MockMoodleAdapter` implementations. Controller → Service → Adapter.

**Consequences**: Testable without real Moodle, clean separation. Redis-backed mock enables cross-process sharing.

## ADR-004: Strict Multi-Tenant Isolation with RLS
**Status**: Accepted

**Context**: Enterprise SaaS requires bulletproof tenant isolation. Cannot rely solely on application code.

**Decision**: `FORCE ROW LEVEL SECURITY` on all tenant tables with 4 PostgreSQL roles. `mcc_platform` has BYPASSRLS only for provisioning/cross-tenant operations.

**Consequences**: Defense in depth. Requires careful tenant context handling in all queries.

## ADR-005: HMAC Access Tokens, Opaque Refresh Tokens
**Status**: Accepted

**Context**: JWTs have known issues (alg confusion, size, revocation). Need secure, revocable session tokens.

**Decision**: Access tokens use HMAC-SHA256 (signed, not encrypted JWT). Refresh tokens are opaque random values stored as SHA-256(pepper||token). Rotation on use, family reuse detection.

**Consequences**: Better revocation, smaller cookies. More custom logic vs standard JWT libs.

## ADR-006: scrypt v2 for Passwords, AES-256-GCM for Encryption
**Status**: Accepted

**Context**: Need modern password hashing and field-level encryption.

**Decision**: scrypt v2 for passwords. Envelope encryption: AES-256-GCM with versioned DEK + HKDF IV.

**Consequences**: Strong security. Key rotation possible via versioned DEKs.

## ADR-007: Plan Engine for Auditable Operations
**Status**: Accepted

**Context**: Bulk/heavy operations need preview, dry-run, approval, execution tracking, compensation.

**Decision**: OperationPlan → Planner → PlanPreview → dry-run → approve → Job → Executor with compensation log. Preview classification differs from persisted ItemState.

**Consequences**: Predictable, auditable operations. Prevents accidental destructive actions.

## ADR-008: BullMQ for Jobs, Redis for State
**Status**: Accepted

**Context**: Need job queue with retries, persistence, and cross-process state sharing for mock.

**Decision**: BullMQ backed by Redis. MockMoodleAdapter state in Redis (shared across API/worker). Worker: maxRetriesPerRequest null; producer: lazyConnect true, maxRetriesPerRequest 3.

**Consequences**: Simple, reliable job processing. Mock works across processes.

## ADR-009: Decorator Metadata via tsc (not esbuild)
**Status**: Accepted

**Context**: NestJS requires design:paramtypes for DI. esbuild doesn't emit decorator metadata.

**Decision**: Compile with `tsc` (no tsx/esbuild). Vitest uses custom TS-transpile plugin with emitDecoratorMetadata and experimentalDecorators.

**Consequences**: Correct DI at runtime. Slightly slower transforms vs esbuild.

## ADR-010: Test Isolation Strategy
**Status**: Accepted

**Context**: Tests must not interfere. RLS/auth suites share DB/Redis; parallelism causes fixture conflicts.

**Decision**: Vitest with pool: 'forks', singleFork: true. Redis DB 2 for tests. Clear mock state between tests. Never use logger: false (Nest exits silently).

**Consequences**: Reliable, deterministic tests. Slower than full parallelism but necessary for isolation.
