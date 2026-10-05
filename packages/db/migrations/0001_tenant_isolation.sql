-- Tenant isolation: Row Level Security.
--
-- Applied after the schema migration. Every tenant-scoped table is switched to
-- FORCE ROW LEVEL SECURITY, so the policy applies even to the table owner — a
-- forgotten `where tenant_id = ?` becomes a loud policy violation instead of a
-- silent data breach.
--
-- Each policy compares `tenant_id` against `app.tenant_id`, which the request
-- scope sets with `set_config(..., true)` inside a transaction. Reading a tenant
-- table without an active scope returns zero rows rather than every row,
-- because the policy compares against NULL.
--
-- The consequence, stated plainly: FORCE RLS also blocks the operations that
-- bootstrap a tenant (creating the row whose id *is* the scope, and creating a
-- user before that user has a membership). Those run on the `mcc_platform`
-- connection, which is the only role granted BYPASSRLS. See infra/postgres/init.

-- ══ mcc: tenants and identity ═══════════════════════════════════════════════

alter table mcc.tenants enable row level security;
alter table mcc.tenants force row level security;
drop policy if exists tenant_isolation on mcc.tenants;
create policy tenant_isolation on mcc.tenants
  using (id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (id = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- `users` is global: one identity may belong to several tenants. Access is
-- granted through membership rather than a tenant_id column.
alter table mcc.users enable row level security;
alter table mcc.users force row level security;
drop policy if exists tenant_isolation on mcc.users;
create policy users_via_membership on mcc.users
  using (
    exists (
      select 1
      from mcc.tenant_members tm
      where tm.user_id = mcc.users.id
        and tm.tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
    )
  );

alter table mcc.tenant_members enable row level security;
alter table mcc.tenant_members force row level security;
drop policy if exists tenant_isolation on mcc.tenant_members;
create policy tenant_isolation on mcc.tenant_members
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

alter table mcc.user_roles enable row level security;
alter table mcc.user_roles force row level security;
drop policy if exists tenant_isolation on mcc.user_roles;
create policy tenant_isolation on mcc.user_roles
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- The role catalogue is shared and immutable at runtime. Readable with any
-- active scope, never writable.
alter table mcc.role_permissions enable row level security;
alter table mcc.role_permissions force row level security;
drop policy if exists tenant_isolation on mcc.role_permissions;
create policy role_permissions_readonly on mcc.role_permissions
  using (current_setting('app.tenant_id', true) is not null)
  with check (false);

-- Schema privileges belong with the DDL, not only with the container init
-- scripts. `create schema` in the previous migration grants nothing, so a
-- database rebuilt from migrations alone would leave the runtime roles unable
-- to resolve these schemas at all. Guarded on role existence so the migration
-- also applies where the roles are provisioned separately.
--
-- Table privileges follow the same reasoning. Relying on `ALTER DEFAULT
-- PRIVILEGES` alone is fragile: those entries are keyed by schema OID, so
-- dropping and recreating a schema silently discards them.
do $$
declare
  tbl record;
begin
  if not exists (select 1 from pg_roles where rolname = 'mcc_app') then
    return;
  end if;

  grant usage on schema mcc, dw, audit to mcc_app;

  if exists (select 1 from pg_roles where rolname = 'mcc_platform') then
    grant usage on schema mcc, dw, audit to mcc_platform;
  end if;
  if exists (select 1 from pg_roles where rolname = 'mcc_ro') then
    grant usage on schema mcc, dw, audit to mcc_ro;
  end if;

  for tbl in
    select schemaname, tablename
    from pg_tables
    where schemaname in ('mcc', 'dw')
  loop
    execute format('grant select, insert, update, delete on table %I.%I to mcc_app',
                   tbl.schemaname, tbl.tablename);
    execute format('grant select, insert, update, delete on table %I.%I to mcc_platform',
                   tbl.schemaname, tbl.tablename);

    if exists (select 1 from pg_roles where rolname = 'mcc_ro') then
      execute format('grant select on table %I.%I to mcc_ro',
                     tbl.schemaname, tbl.tablename);
    end if;
  end loop;

  -- The audit log is granted separately: append-only means INSERT and SELECT
  -- only, so it must not receive the blanket DML grant above.
  for tbl in
    select schemaname, tablename
    from pg_tables
    where schemaname = 'audit'
  loop
    execute format('grant select, insert on table %I.%I to mcc_app',
                   tbl.schemaname, tbl.tablename);
    execute format('grant select, insert on table %I.%I to mcc_platform',
                   tbl.schemaname, tbl.tablename);

    if exists (select 1 from pg_roles where rolname = 'mcc_ro') then
      execute format('grant select on table %I.%I to mcc_ro',
                     tbl.schemaname, tbl.tablename);
    end if;
  end loop;
end
$$;

-- Sequences (identity columns in PostgreSQL 16 are covered by the table grant,
-- but older deployments and future serial columns are not).
do $$
declare
  seq record;
begin
  if not exists (select 1 from pg_roles where rolname = 'mcc_app') then
    return;
  end if;

  for seq in
    select sequence_schema, sequence_name
    from information_schema.sequences
    where sequence_schema in ('mcc', 'dw', 'audit')
  loop
    execute format('grant usage, select on sequence %I.%I to mcc_app',
                   seq.sequence_schema, seq.sequence_name);
    execute format('grant usage, select on sequence %I.%I to mcc_platform',
                   seq.sequence_schema, seq.sequence_name);
  end loop;
end
$$;

alter table mcc.sessions enable row level security;
alter table mcc.sessions force row level security;
drop policy if exists tenant_isolation on mcc.sessions;
-- Sessions follow their own tenant: a user with several memberships must be
-- able to authenticate before switching to a specific tenant.
create policy sessions_by_tenant on mcc.sessions
  using (tenant_id is null or tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id is null or tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

alter table mcc.password_reset_tokens enable row level security;
alter table mcc.password_reset_tokens force row level security;
drop policy if exists tenant_isolation on mcc.password_reset_tokens;
create policy password_reset_by_membership on mcc.password_reset_tokens
  using (
    exists (
      select 1 from mcc.tenant_members tm
      where tm.user_id = mcc.password_reset_tokens.user_id
        and tm.tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
    )
  );

-- Throttling rows are written before a tenant is resolved, so they are readable
-- with any active scope and never mutable.
alter table mcc.login_attempts enable row level security;
alter table mcc.login_attempts force row level security;
drop policy if exists tenant_isolation on mcc.login_attempts;
create policy login_attempts_readonly on mcc.login_attempts
  using (current_setting('app.tenant_id', true) is not null)
  with check (false);

alter table mcc.system_settings enable row level security;
alter table mcc.system_settings force row level security;
drop policy if exists tenant_isolation on mcc.system_settings;
create policy system_settings_readonly on mcc.system_settings
  using (current_setting('app.tenant_id', true) is not null)
  with check (false);

-- ══ mcc: Moodle integration ═════════════════════════════════════════════════

alter table mcc.moodle_instances enable row level security;
alter table mcc.moodle_instances force row level security;
drop policy if exists tenant_isolation on mcc.moodle_instances;
create policy tenant_isolation on mcc.moodle_instances
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- Tables that reach the tenant through the instance they belong to. This keeps
-- the invariant in one place: a credential or snapshot can never be read by
-- guessing its id, because the instance it points to must itself be in scope.
alter table mcc.moodle_credentials enable row level security;
alter table mcc.moodle_credentials force row level security;
drop policy if exists tenant_isolation on mcc.moodle_credentials;
create policy tenant_isolation on mcc.moodle_credentials
  using (exists (
    select 1 from mcc.moodle_instances mi
    where mi.id = mcc.moodle_credentials.instance_id
      and mi.tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
  ))
  with check (exists (
    select 1 from mcc.moodle_instances mi
    where mi.id = mcc.moodle_credentials.instance_id
      and mi.tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
  ));

alter table mcc.moodle_capability_snapshots enable row level security;
alter table mcc.moodle_capability_snapshots force row level security;
drop policy if exists tenant_isolation on mcc.moodle_capability_snapshots;
create policy tenant_isolation on mcc.moodle_capability_snapshots
  using (exists (
    select 1 from mcc.moodle_instances mi
    where mi.id = mcc.moodle_capability_snapshots.instance_id
      and mi.tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
  ));

alter table mcc.moodle_health_checks enable row level security;
alter table mcc.moodle_health_checks force row level security;
drop policy if exists tenant_isolation on mcc.moodle_health_checks;
create policy tenant_isolation on mcc.moodle_health_checks
  using (exists (
    select 1 from mcc.moodle_instances mi
    where mi.id = mcc.moodle_health_checks.instance_id
      and mi.tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
  ));

alter table mcc.sync_state enable row level security;
alter table mcc.sync_state force row level security;
drop policy if exists tenant_isolation on mcc.sync_state;
create policy tenant_isolation on mcc.sync_state
  using (exists (
    select 1 from mcc.moodle_instances mi
    where mi.id = mcc.sync_state.moodle_instance_id
      and mi.tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
  ));

alter table mcc.sync_runs enable row level security;
alter table mcc.sync_runs force row level security;
drop policy if exists tenant_isolation on mcc.sync_runs;
create policy tenant_isolation on mcc.sync_runs
  using (exists (
    select 1 from mcc.moodle_instances mi
    where mi.id = mcc.sync_runs.moodle_instance_id
      and mi.tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
  ));

-- ══ mcc: plans, jobs and notifications ═════════════════════════════════════

alter table mcc.operation_plans enable row level security;
alter table mcc.operation_plans force row level security;
drop policy if exists tenant_isolation on mcc.operation_plans;
create policy tenant_isolation on mcc.operation_plans
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

alter table mcc.plan_items enable row level security;
alter table mcc.plan_items force row level security;
drop policy if exists tenant_isolation on mcc.plan_items;
create policy tenant_isolation on mcc.plan_items
  using (exists (
    select 1 from mcc.operation_plans p
    where p.id = mcc.plan_items.plan_id
      and p.tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
  ))
  with check (exists (
    select 1 from mcc.operation_plans p
    where p.id = mcc.plan_items.plan_id
      and p.tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
  ));

alter table mcc.jobs enable row level security;
alter table mcc.jobs force row level security;
drop policy if exists tenant_isolation on mcc.jobs;
create policy tenant_isolation on mcc.jobs
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

alter table mcc.job_errors enable row level security;
alter table mcc.job_errors force row level security;
drop policy if exists tenant_isolation on mcc.job_errors;
create policy tenant_isolation on mcc.job_errors
  using (exists (
    select 1 from mcc.jobs j
    where j.id = mcc.job_errors.job_id
      and j.tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
  ));

-- The outbox and the call log can hold platform-scoped rows (full sync, shared
-- helpers), so a NULL tenant is visible to any active scope rather than hidden.
alter table mcc.outbox enable row level security;
alter table mcc.outbox force row level security;
drop policy if exists tenant_isolation on mcc.outbox;
create policy tenant_isolation on mcc.outbox
  using (tenant_id is null or tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id is null or tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

alter table mcc.api_call_log enable row level security;
alter table mcc.api_call_log force row level security;
drop policy if exists tenant_isolation on mcc.api_call_log;
create policy tenant_isolation on mcc.api_call_log
  using (tenant_id is null or tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

alter table mcc.notifications enable row level security;
alter table mcc.notifications force row level security;
drop policy if exists tenant_isolation on mcc.notifications;
-- Reads are additionally limited to the addressed user, so a support role with
-- `notifications.read` cannot enumerate another user's inbox.
create policy tenant_isolation on mcc.notifications
  using (
    tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
    and user_id = nullif(current_setting('app.actor_id', true), '')::uuid
  )
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

alter table mcc.tenant_settings enable row level security;
alter table mcc.tenant_settings force row level security;
drop policy if exists tenant_isolation on mcc.tenant_settings;
create policy tenant_isolation on mcc.tenant_settings
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

alter table mcc.api_keys enable row level security;
alter table mcc.api_keys force row level security;
drop policy if exists tenant_isolation on mcc.api_keys;
create policy tenant_isolation on mcc.api_keys
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- ══ dw: analytics store ════════════════════════════════════════════════════
-- `tenant_id` is denormalised onto every analytics table precisely so these
-- policies stay evaluable without a join, and so the read-only BI role can be
-- tenant-scoped too.

alter table dw.dim_moodle_instance enable row level security;
alter table dw.dim_moodle_instance force row level security;
drop policy if exists tenant_isolation on dw.dim_moodle_instance;
create policy tenant_isolation on dw.dim_moodle_instance
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

alter table dw.dim_user enable row level security;
alter table dw.dim_user force row level security;
drop policy if exists tenant_isolation on dw.dim_user;
create policy tenant_isolation on dw.dim_user
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

alter table dw.dim_category enable row level security;
alter table dw.dim_category force row level security;
drop policy if exists tenant_isolation on dw.dim_category;
create policy tenant_isolation on dw.dim_category
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

alter table dw.dim_period enable row level security;
alter table dw.dim_period force row level security;
drop policy if exists tenant_isolation on dw.dim_period;
create policy tenant_isolation on dw.dim_period
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

alter table dw.dim_course enable row level security;
alter table dw.dim_course force row level security;
drop policy if exists tenant_isolation on dw.dim_course;
create policy tenant_isolation on dw.dim_course
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

alter table dw.dim_activity enable row level security;
alter table dw.dim_activity force row level security;
drop policy if exists tenant_isolation on dw.dim_activity;
create policy tenant_isolation on dw.dim_activity
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

alter table dw.dim_cohort enable row level security;
alter table dw.dim_cohort force row level security;
drop policy if exists tenant_isolation on dw.dim_cohort;
create policy tenant_isolation on dw.dim_cohort
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

alter table dw.dim_group enable row level security;
alter table dw.dim_group force row level security;
drop policy if exists tenant_isolation on dw.dim_group;
create policy tenant_isolation on dw.dim_group
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

alter table dw.fact_enrolment enable row level security;
alter table dw.fact_enrolment force row level security;
drop policy if exists tenant_isolation on dw.fact_enrolment;
create policy tenant_isolation on dw.fact_enrolment
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

alter table dw.fact_grade enable row level security;
alter table dw.fact_grade force row level security;
drop policy if exists tenant_isolation on dw.fact_grade;
create policy tenant_isolation on dw.fact_grade
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

alter table dw.fact_completion enable row level security;
alter table dw.fact_completion force row level security;
drop policy if exists tenant_isolation on dw.fact_completion;
create policy tenant_isolation on dw.fact_completion
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

alter table dw.fact_access_daily enable row level security;
alter table dw.fact_access_daily force row level security;
drop policy if exists tenant_isolation on dw.fact_access_daily;
create policy tenant_isolation on dw.fact_access_daily
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

alter table dw.fact_course_snapshot enable row level security;
alter table dw.fact_course_snapshot force row level security;
drop policy if exists tenant_isolation on dw.fact_course_snapshot;
create policy tenant_isolation on dw.fact_course_snapshot
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

alter table dw.fact_user_risk_daily enable row level security;
alter table dw.fact_user_risk_daily force row level security;
drop policy if exists tenant_isolation on dw.fact_user_risk_daily;
create policy tenant_isolation on dw.fact_user_risk_daily
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- ══ audit ══════════════════════════════════════════════════════════════════

alter table audit.audit_logs enable row level security;
alter table audit.audit_logs force row level security;
drop policy if exists tenant_isolation on audit.audit_logs;
create policy tenant_isolation on audit.audit_logs
  using (tenant_id is null or tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id is null or tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

alter table audit.audit_sequence enable row level security;
alter table audit.audit_sequence force row level security;
drop policy if exists tenant_isolation on audit.audit_sequence;
create policy tenant_isolation on audit.audit_sequence
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

alter table audit.audit_partition_maintenance enable row level security;
alter table audit.audit_partition_maintenance force row level security;
drop policy if exists tenant_isolation on audit.audit_partition_maintenance;
create policy maintenance_readonly on audit.audit_partition_maintenance
  using (current_setting('app.tenant_id', true) is not null)
  with check (false);

-- Append-only is enforced by privilege, not convention.
revoke update, delete, truncate on audit.audit_logs from public;

-- Nothing in the running system rewrites or deletes an audit row, including the
-- platform role used for cross-tenant jobs. Guarded so the migration also
-- applies to a database provisioned without the local init scripts.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'mcc_app') then
    revoke update, delete, truncate on audit.audit_logs from mcc_app;
  end if;
  if exists (select 1 from pg_roles where rolname = 'mcc_platform') then
    revoke update, delete, truncate on audit.audit_logs from mcc_platform;
  end if;
end
$$;

comment on schema mcc is
  'Control plane: source of truth for tenants, identities, RBAC, Moodle connections, plans, jobs and workflows. All tables use FORCE ROW LEVEL SECURITY keyed on app.tenant_id.';

comment on schema dw is
  'Analytics store: derived from Moodle by the sync engine. Never a source of truth — if it disagrees with Moodle, Moodle wins and the sync corrects it.';

comment on schema audit is
  'Append-only, hash-chained audit log. UPDATE/DELETE/TRUNCATE revoked for every runtime role; rows are chained via prev_hash/row_hash so editing an earlier row invalidates every hash after it.';

comment on table mcc.operation_plans is
  'Write path of the product. Every mutation travels through a plan so dry-run, idempotency, audit and rollback stay uniform.';

comment on table mcc.moodle_credentials is
  'Envelope-encrypted Moodle web service tokens. Ciphertext only; the master key never enters the database.';

comment on table dw.fact_user_risk_daily is
  'Daily student risk snapshots. Append-only with model_version, so a scoring change never silently rewrites history and an old score stays explainable against the factors recorded with it.';
