-- Pre-flight guards for the control-plane schemas.
--
-- Runs before migrations so an unsafe environment fails here rather than after
-- application code is deployed.

DO $$
DECLARE
  current_rol TEXT := current_user;
BEGIN
  -- 1. The migration role owns the schemas, so it must be the owner role.
  --    Running migrations as the runtime role would make FORCE RLS meaningless.
  IF current_rol NOT IN ('mcc_owner', 'postgres', 'mcc_migrator') THEN
    RAISE EXCEPTION
      'Migrations must run as mcc_owner (or postgres), not %', current_rol;
  END IF;

  -- 2. Refuse to run against a database that looks like production.
  IF current_database() IN ('postgres', 'template0', 'template1') THEN
    RAISE EXCEPTION 'Refusing to initialise schemas in database %', current_database();
  END IF;
END
$$;

CREATE SCHEMA IF NOT EXISTS mcc;
CREATE SCHEMA IF NOT EXISTS dw;
CREATE SCHEMA IF NOT EXISTS audit;

COMMENT ON SCHEMA mcc IS
  'Control plane: source of truth for tenants, identities, RBAC, Moodle connections, plans, jobs and workflows.';
COMMENT ON SCHEMA dw IS
  'Analytics store: derived from Moodle by the sync engine. Never a source of truth.';
COMMENT ON SCHEMA audit IS
  'Append-only, hash-chained audit log. UPDATE and DELETE revoked for the application role.';

-- Case-insensitive email uniqueness. Requires citext or an expression index; the
-- schema uses a functional unique index on lower(email), so this extension is
-- not required. Kept explicit for future ad-hoc queries.
CREATE EXTENSION IF NOT EXISTS pgcrypto;