# Architecture Decision Records

See [DECISIONS.md](./DECISIONS.md) for the full ADR list (10 ADRs). For historical context, also see individual ADR files in older commits if they exist.

Key decisions:
- ADR-001: Monorepo with pnpm + Turborepo
- ADR-002: NestJS for API/worker (shared module graph)
- ADR-003: Adapter pattern for LMS (LmsAdapter port)
- ADR-004: RLS with FORCE ROW LEVEL SECURITY
- ADR-005: HMAC access tokens + opaque refresh tokens
- ADR-006: scrypt v2 + AES-256-GCM envelope encryption
- ADR-007: Plan Engine with dry-run/approval
- ADR-008: BullMQ + Redis (mock state shared)
- ADR-009: tsc for decorator metadata (no esbuild)
- ADR-010: Vitest forks with singleFork isolation
