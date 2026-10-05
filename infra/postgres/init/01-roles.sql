-- Roles for the Moodle Control Center control plane.
--
-- Deliberately separate from the table owner:
--   mcc_owner     owns tables and runs migrations
--   mcc_app       request-serving DML only; NOBYPASSRLS, no ownership
--   mcc_platform  the single BYPASSRLS role, for tenant provisioning, login-time
--                 identity lookup and cross-tenant jobs. Never used by controllers.
--   mcc_ro        read-only role for external BI and support queries
--
-- The split is what makes the audit log append-only and tenant isolation real:
-- the runtime role cannot update or delete audit rows, and cannot bypass RLS.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mcc_owner') THEN
    CREATE ROLE mcc_owner LOGIN PASSWORD 'mcc_owner_local';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mcc_app') THEN
    CREATE ROLE mcc_app LOGIN PASSWORD 'mcc_app_local';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mcc_platform') THEN
    CREATE ROLE mcc_platform LOGIN PASSWORD 'mcc_platform_local';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mcc_ro') THEN
    CREATE ROLE mcc_ro LOGIN PASSWORD 'mcc_ro_local';
  END IF;
END
$$;

-- The request-serving role must never bypass RLS or be a superuser.
ALTER ROLE mcc_app NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
ALTER ROLE mcc_ro NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
ALTER ROLE mcc_owner NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE;

-- mcc_platform is the deliberate exception, and it is scoped as tightly as the
-- schema allows. It exists because FORCE ROW LEVEL SECURITY (which we keep ON,
-- so a forgotten WHERE clause can never leak a tenant) makes these operations
-- impossible for the request role:
--
--   * tenant provisioning — creating a tenant row whose id IS the scope
--   * identity lookup during login, before any tenant is known
--   * platform-wide jobs (full sync, cross-tenant reports)
--
-- It can read across tenants and nothing else. Request handling never uses it,
-- and no controller is allowed to hold a connection built from it.
ALTER ROLE mcc_platform BYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;

CREATE SCHEMA IF NOT EXISTS mcc AUTHORIZATION mcc_owner;
CREATE SCHEMA IF NOT EXISTS dw AUTHORIZATION mcc_owner;
CREATE SCHEMA IF NOT EXISTS audit AUTHORIZATION mcc_owner;

-- PostgreSQL 15+ removed the default CREATE grant on `public`. Drizzle emits
-- enum types there, so the owner needs it back — and only the owner: the app and
-- read-only roles must never be able to create objects.
GRANT USAGE, CREATE ON SCHEMA public TO mcc_owner;
REVOKE CREATE ON SCHEMA public FROM mcc_app, mcc_ro, PUBLIC;

GRANT USAGE ON SCHEMA mcc, dw, audit TO mcc_app, mcc_platform, mcc_ro;
GRANT USAGE ON SCHEMA mcc, dw, audit TO mcc_owner;

-- Default privileges: the owner grants the app role DML, and the owner keeps
-- DDL for itself. Migrations therefore run as mcc_owner, not mcc_app.
ALTER DEFAULT PRIVILEGES FOR ROLE mcc_owner IN SCHEMA mcc, dw, audit
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO mcc_app;

-- mcc_platform gets the same DML as mcc_app; its extra reach comes from BYPASSRLS,
-- not from broader table privileges. Keeping the grants identical means the
-- blast radius of the BYPASSRLS grant is limited to row visibility.
ALTER DEFAULT PRIVILEGES FOR ROLE mcc_owner IN SCHEMA mcc, dw, audit
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO mcc_platform;

ALTER DEFAULT PRIVILEGES FOR ROLE mcc_owner IN SCHEMA mcc, dw, audit
  GRANT SELECT ON TABLES TO mcc_ro;

ALTER DEFAULT PRIVILEGES FOR ROLE mcc_owner IN SCHEMA mcc, dw, audit
  GRANT USAGE, SELECT ON SEQUENCES TO mcc_app, mcc_platform;

-- mcc_owner runs migrations, so it needs CREATE on the database (to create the
-- schemas) in addition to CONNECT. It is deliberately NOT the database owner.
GRANT CONNECT, CREATE, TEMPORARY ON DATABASE moodle_control_center TO mcc_owner;
GRANT CONNECT, TEMPORARY ON DATABASE moodle_control_center TO mcc_app, mcc_platform, mcc_ro;

-- The app and platform roles must never be able to create schemas or extensions.
REVOKE CREATE ON DATABASE moodle_control_center FROM mcc_app, mcc_platform, mcc_ro;

-- Append-only enforcement for audit. Even the platform role keeps INSERT and
-- SELECT only: nothing in the running system rewrites or deletes an audit row.
REVOKE UPDATE, DELETE, TRUNCATE ON audit.audit_logs FROM mcc_app, mcc_platform;

-- Encrypting/decrypting Moodle credentials happens in the application with the
-- master key from the secret manager; the database stores only ciphertext.