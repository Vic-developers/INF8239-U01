# Database Design

## Overview
PostgreSQL with Drizzle ORM. Multi-tenant with strict row-level security.

## Database Roles (4)
1. `mcc_owner` - Schema management, migrations
2. `mcc_app` - Application read/write (RLS enforced)
3. `mcc_readonly` - Read-only access
4. `mcc_platform` - Platform operations (BYPASSRLS for provisioning only)

## Core Tables
- Tenants, users, memberships with roles/permissions
- Moodle instances (multi-Moodle per tenant)
- Plans, PlanItems, Jobs, JobLogs
- Tokens (refresh tokens, opaque)
- Audit logs
- Encryption key metadata (DEKs)

## Multi-Tenancy
- `tenant_id` on all tenant-scoped tables (FK to tenants)
- `FORCE ROW LEVEL SECURITY` on tenant tables
- RLS policies filter by `current_setting('app.tenant_id')` or equivalent session context
- All queries must run with proper tenant context

## Migrations
- Located in `packages/db/migrations/`
- Run via Drizzle migration tools
- `DATABASE_MIGRATION_URL` for owner role
- `DATABASE_URL` for app role
- `DATABASE_PLATFORM_URL` for platform role

## Mock State (Redis)
- Hash: `mcc:mock:state:<instanceId>`
- Field: `<kind>:<naturalKey>`
- Shared across API/worker processes
- Used by MockMoodleAdapter for development/testing

## Connection Strings
- Use `127.0.0.1` (not `localhost`)
- Dev: port 5434 (Postgres), 6379 (Redis)
- Test: Redis DB 2 for isolation
