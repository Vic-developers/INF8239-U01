CREATE SCHEMA IF NOT EXISTS "mcc";
--> statement-breakpoint
CREATE SCHEMA IF NOT EXISTS "dw";
--> statement-breakpoint
CREATE SCHEMA IF NOT EXISTS "audit";
--> statement-breakpoint
CREATE TYPE "mcc"."item_state" AS ENUM('pending', 'running', 'done', 'failed', 'skipped', 'conflict', 'unknown');--> statement-breakpoint
CREATE TYPE "mcc"."job_status" AS ENUM('queued', 'running', 'paused', 'completed', 'completed_with_errors', 'failed', 'cancelled', 'blocked');--> statement-breakpoint
CREATE TYPE "mcc"."moodle_status" AS ENUM('active', 'disabled', 'error');--> statement-breakpoint
CREATE TYPE "mcc"."plan_status" AS ENUM('draft', 'previewed', 'awaiting_approval', 'approved', 'executing', 'completed', 'completed_with_errors', 'cancelled', 'failed');--> statement-breakpoint
CREATE TYPE "mcc"."probe_status" AS ENUM('ok', 'degraded', 'down', 'never');--> statement-breakpoint
CREATE TYPE "mcc"."tenant_status" AS ENUM('active', 'suspended', 'trial');--> statement-breakpoint
CREATE TYPE "mcc"."user_status" AS ENUM('active', 'invited', 'disabled', 'locked');--> statement-breakpoint
CREATE TABLE "mcc"."api_call_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"moodle_instance_id" uuid,
	"fn" text NOT NULL,
	"job_id" uuid,
	"request_id" text,
	"duration_ms" integer NOT NULL,
	"status_code" integer,
	"ok" boolean NOT NULL,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mcc"."api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"key_hash" text NOT NULL,
	"key_prefix" text NOT NULL,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mcc"."audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"actor_id" uuid,
	"actor_email" text,
	"moodle_instance_id" uuid,
	"action" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text,
	"request_id" text NOT NULL,
	"job_id" uuid,
	"plan_id" uuid,
	"ip_address" text,
	"user_agent" text,
	"result" text DEFAULT 'success' NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"metadata" jsonb,
	"row_hash" text NOT NULL,
	"prev_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mcc"."job_errors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"item_ordinal" integer,
	"natural_key" text,
	"code" text NOT NULL,
	"message" text NOT NULL,
	"remediation" jsonb,
	"debug_context" jsonb,
	"attempts" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mcc"."jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"plan_id" uuid,
	"bull_job_id" text,
	"type" text NOT NULL,
	"queue" text NOT NULL,
	"status" "mcc"."job_status" DEFAULT 'queued' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"processed" integer DEFAULT 0 NOT NULL,
	"succeeded" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"skipped" integer DEFAULT 0 NOT NULL,
	"checkpoint_cursor" integer DEFAULT 0 NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"result" jsonb,
	"blocked_reason" text,
	"created_by" uuid,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"duration_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mcc"."login_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"tenant_slug" text,
	"ip_address" text NOT NULL,
	"successful" boolean NOT NULL,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mcc"."moodle_capability_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instance_id" uuid NOT NULL,
	"functions_hash" text NOT NULL,
	"functions_json" jsonb NOT NULL,
	"granted_capabilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"denied_capabilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"missing_required" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"probe_available" boolean DEFAULT false NOT NULL,
	"added_functions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"removed_functions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"probed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mcc"."moodle_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instance_id" uuid NOT NULL,
	"secret_ciphertext" text NOT NULL,
	"iv" text NOT NULL,
	"auth_tag" text NOT NULL,
	"wrapped_dek" text NOT NULL,
	"key_version" integer DEFAULT 1 NOT NULL,
	"token_last4" text NOT NULL,
	"service_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"rotated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "mcc"."moodle_health_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instance_id" uuid NOT NULL,
	"status" "mcc"."probe_status" NOT NULL,
	"checks" jsonb NOT NULL,
	"latency_p50_ms" integer NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mcc"."moodle_instances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"base_url" text NOT NULL,
	"status" "mcc"."moodle_status" DEFAULT 'active' NOT NULL,
	"moodle_version" text,
	"moodle_release" text,
	"moodle_version_number" integer,
	"sitename" text,
	"rate_limit_profile" text DEFAULT 'default' NOT NULL,
	"plugin_installed" boolean DEFAULT false NOT NULL,
	"last_probe_at" timestamp with time zone,
	"last_probe_status" "mcc"."probe_status" DEFAULT 'never' NOT NULL,
	"last_latency_p50_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mcc"."notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"topic" text NOT NULL,
	"severity" text DEFAULT 'info' NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"link" text,
	"resource_type" text,
	"resource_id" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mcc"."operation_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"moodle_instance_id" uuid,
	"kind" text NOT NULL,
	"status" "mcc"."plan_status" DEFAULT 'draft' NOT NULL,
	"options" jsonb NOT NULL,
	"policy" jsonb NOT NULL,
	"origin" text DEFAULT 'ui' NOT NULL,
	"idempotency_key" text,
	"preview" jsonb,
	"preview_hash" text,
	"previewed_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"executed_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mcc"."outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"topic" text NOT NULL,
	"payload" jsonb NOT NULL,
	"published_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mcc"."password_reset_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mcc"."plan_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"natural_key" text NOT NULL,
	"target_type" text NOT NULL,
	"moodle_id" text,
	"desired_hash" text,
	"desired" jsonb NOT NULL,
	"state" "mcc"."item_state" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error_code" text,
	"error_message" text,
	"compensation" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mcc"."role_permissions" (
	"role_key" text NOT NULL,
	"permission_key" text NOT NULL,
	"granted" boolean DEFAULT true NOT NULL,
	CONSTRAINT "role_permissions_role_key_permission_key_pk" PRIMARY KEY("role_key","permission_key")
);
--> statement-breakpoint
CREATE TABLE "mcc"."sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"tenant_id" uuid,
	"refresh_token_hash" text NOT NULL,
	"family_id" uuid NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_reason" text,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mcc"."sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"moodle_instance_id" uuid NOT NULL,
	"job_id" uuid,
	"entity" text NOT NULL,
	"mode" text NOT NULL,
	"records_processed" integer DEFAULT 0 NOT NULL,
	"created" integer DEFAULT 0 NOT NULL,
	"updated" integer DEFAULT 0 NOT NULL,
	"deleted" integer DEFAULT 0 NOT NULL,
	"errors" integer DEFAULT 0 NOT NULL,
	"duration_ms" integer,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "mcc"."sync_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"moodle_instance_id" uuid NOT NULL,
	"entity" text NOT NULL,
	"cursor" text,
	"last_full_at" timestamp with time zone,
	"last_run_at" timestamp with time zone,
	"rows_processed" integer DEFAULT 0 NOT NULL,
	"rows_created" integer DEFAULT 0 NOT NULL,
	"rows_updated" integer DEFAULT 0 NOT NULL,
	"rows_deleted" integer DEFAULT 0 NOT NULL,
	"rows_errored" integer DEFAULT 0 NOT NULL,
	"avg_lag_seconds" integer,
	"etag" text,
	"last_error" text
);
--> statement-breakpoint
CREATE TABLE "mcc"."system_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mcc"."tenant_members" (
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "mcc"."user_status" DEFAULT 'active' NOT NULL,
	"invited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"joined_at" timestamp with time zone,
	CONSTRAINT "tenant_members_tenant_id_user_id_pk" PRIMARY KEY("tenant_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "mcc"."tenant_settings" (
	"tenant_id" uuid NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_settings_tenant_id_key_pk" PRIMARY KEY("tenant_id","key")
);
--> statement-breakpoint
CREATE TABLE "mcc"."tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"status" "mcc"."tenant_status" DEFAULT 'trial' NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"locale" text DEFAULT 'es' NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mcc"."user_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"role_key" text NOT NULL,
	"scope_type" text DEFAULT 'tenant' NOT NULL,
	"scope_id" uuid,
	"granted_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mcc"."users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text,
	"status" "mcc"."user_status" DEFAULT 'invited' NOT NULL,
	"locale" text DEFAULT 'es' NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"mfa_enabled" boolean DEFAULT false NOT NULL,
	"mfa_secret_ciphertext" text,
	"email_verified_at" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"failed_login_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"preferences" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dw"."dim_activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"moodle_instance_id" uuid NOT NULL,
	"moodle_id" integer NOT NULL,
	"course_moodle_id" integer NOT NULL,
	"module_name" text NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 1 NOT NULL,
	"visible" boolean DEFAULT true NOT NULL,
	"open_date" timestamp with time zone,
	"close_date" timestamp with time zone,
	"due_date" timestamp with time zone,
	"completion_tracked" boolean DEFAULT false NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dw"."dim_category" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"moodle_instance_id" uuid NOT NULL,
	"moodle_id" integer NOT NULL,
	"name" text NOT NULL,
	"parent_id" integer,
	"path" text NOT NULL,
	"depth" integer DEFAULT 0 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"description" text,
	"is_current" boolean DEFAULT true NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dw"."dim_cohort" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"moodle_instance_id" uuid NOT NULL,
	"moodle_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"course_moodle_id" integer,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dw"."dim_course" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"moodle_instance_id" uuid NOT NULL,
	"moodle_id" integer NOT NULL,
	"short_name" text NOT NULL,
	"full_name" text NOT NULL,
	"summary" text,
	"category_moodle_id" integer,
	"category_path" text,
	"period_id" uuid,
	"start_date" timestamp with time zone,
	"end_date" timestamp with time zone,
	"visible" boolean DEFAULT true NOT NULL,
	"has_teacher" boolean DEFAULT false NOT NULL,
	"has_activities" boolean DEFAULT false NOT NULL,
	"has_completion" boolean DEFAULT false NOT NULL,
	"has_grading" boolean DEFAULT false NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL,
	"is_current" boolean DEFAULT true NOT NULL,
	"valid_from" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_to" timestamp with time zone,
	"source_hash" text,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dw"."dim_group" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"moodle_instance_id" uuid NOT NULL,
	"moodle_id" integer NOT NULL,
	"name" text NOT NULL,
	"course_moodle_id" integer NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dw"."dim_moodle_instance" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"base_url" text NOT NULL,
	"moodle_version" text,
	"last_synced_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "dw"."dim_period" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dw"."dim_user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"moodle_instance_id" uuid NOT NULL,
	"moodle_id" integer NOT NULL,
	"username" text NOT NULL,
	"email" text,
	"first_name" text,
	"last_name" text,
	"full_name" text NOT NULL,
	"auth" text DEFAULT 'manual' NOT NULL,
	"suspended" boolean DEFAULT false NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL,
	"last_access" timestamp with time zone,
	"lang" text,
	"is_current" boolean DEFAULT true NOT NULL,
	"valid_from" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_to" timestamp with time zone,
	"source_hash" text,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dw"."fact_access_daily" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"moodle_instance_id" uuid NOT NULL,
	"user_dim_id" uuid NOT NULL,
	"course_dim_id" uuid,
	"day" date NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"last_access" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "dw"."fact_completion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"moodle_instance_id" uuid NOT NULL,
	"user_dim_id" uuid NOT NULL,
	"course_dim_id" uuid NOT NULL,
	"completion_tracked" boolean DEFAULT false NOT NULL,
	"completed_count" integer DEFAULT 0 NOT NULL,
	"total_count" integer DEFAULT 0 NOT NULL,
	"percentage" numeric(6, 2),
	"is_completed" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp with time zone,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dw"."fact_course_snapshot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"moodle_instance_id" uuid NOT NULL,
	"course_dim_id" uuid NOT NULL,
	"day" date NOT NULL,
	"enrolled_count" integer DEFAULT 0 NOT NULL,
	"active_count" integer DEFAULT 0 NOT NULL,
	"completion_rate" numeric(6, 2),
	"average_grade" numeric(6, 2),
	"pending_grades" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dw"."fact_enrolment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"moodle_instance_id" uuid NOT NULL,
	"user_dim_id" uuid NOT NULL,
	"course_dim_id" uuid NOT NULL,
	"role_moodle_id" integer,
	"role_short_name" text,
	"status" integer DEFAULT 0 NOT NULL,
	"time_start" timestamp with time zone,
	"time_end" timestamp with time zone,
	"is_current" boolean DEFAULT true NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dw"."fact_grade" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"moodle_instance_id" uuid NOT NULL,
	"user_dim_id" uuid NOT NULL,
	"course_dim_id" uuid NOT NULL,
	"item_moodle_id" integer NOT NULL,
	"item_name" text,
	"raw_value" numeric(12, 4),
	"max_value" numeric(12, 4),
	"percentage" numeric(6, 2),
	"graded_at" timestamp with time zone,
	"grader_name" text,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dw"."fact_user_risk_daily" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"moodle_instance_id" uuid NOT NULL,
	"user_dim_id" uuid NOT NULL,
	"course_dim_id" uuid,
	"day" date NOT NULL,
	"score" integer NOT NULL,
	"band" text NOT NULL,
	"factors" jsonb NOT NULL,
	"model_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit"."audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"actor_id" uuid,
	"actor_email" text,
	"moodle_instance_id" uuid,
	"action" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text,
	"request_id" text NOT NULL,
	"job_id" uuid,
	"plan_id" uuid,
	"ip_address" text,
	"user_agent" text,
	"result" text DEFAULT 'success' NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"metadata" jsonb,
	"row_hash" text NOT NULL,
	"prev_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit"."audit_partition_maintenance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partition_month" text NOT NULL,
	"rows_archived" bigint DEFAULT 0 NOT NULL,
	"hash_root" text,
	"archived_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit"."audit_sequence" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"last_hash" text,
	"seq" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mcc"."api_call_log" ADD CONSTRAINT "api_call_log_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "mcc"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcc"."api_call_log" ADD CONSTRAINT "api_call_log_moodle_instance_id_moodle_instances_id_fk" FOREIGN KEY ("moodle_instance_id") REFERENCES "mcc"."moodle_instances"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcc"."api_call_log" ADD CONSTRAINT "api_call_log_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "mcc"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcc"."api_keys" ADD CONSTRAINT "api_keys_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "mcc"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcc"."api_keys" ADD CONSTRAINT "api_keys_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "mcc"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcc"."audit_logs" ADD CONSTRAINT "audit_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "mcc"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcc"."audit_logs" ADD CONSTRAINT "audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "mcc"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcc"."audit_logs" ADD CONSTRAINT "audit_logs_moodle_instance_id_moodle_instances_id_fk" FOREIGN KEY ("moodle_instance_id") REFERENCES "mcc"."moodle_instances"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcc"."audit_logs" ADD CONSTRAINT "audit_logs_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "mcc"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcc"."audit_logs" ADD CONSTRAINT "audit_logs_plan_id_operation_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "mcc"."operation_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcc"."job_errors" ADD CONSTRAINT "job_errors_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "mcc"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcc"."jobs" ADD CONSTRAINT "jobs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "mcc"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcc"."jobs" ADD CONSTRAINT "jobs_plan_id_operation_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "mcc"."operation_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcc"."jobs" ADD CONSTRAINT "jobs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "mcc"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcc"."moodle_capability_snapshots" ADD CONSTRAINT "moodle_capability_snapshots_instance_id_moodle_instances_id_fk" FOREIGN KEY ("instance_id") REFERENCES "mcc"."moodle_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcc"."moodle_credentials" ADD CONSTRAINT "moodle_credentials_instance_id_moodle_instances_id_fk" FOREIGN KEY ("instance_id") REFERENCES "mcc"."moodle_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcc"."moodle_health_checks" ADD CONSTRAINT "moodle_health_checks_instance_id_moodle_instances_id_fk" FOREIGN KEY ("instance_id") REFERENCES "mcc"."moodle_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcc"."moodle_instances" ADD CONSTRAINT "moodle_instances_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "mcc"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcc"."notifications" ADD CONSTRAINT "notifications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "mcc"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcc"."notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "mcc"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcc"."operation_plans" ADD CONSTRAINT "operation_plans_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "mcc"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcc"."operation_plans" ADD CONSTRAINT "operation_plans_moodle_instance_id_moodle_instances_id_fk" FOREIGN KEY ("moodle_instance_id") REFERENCES "mcc"."moodle_instances"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcc"."operation_plans" ADD CONSTRAINT "operation_plans_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "mcc"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcc"."operation_plans" ADD CONSTRAINT "operation_plans_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "mcc"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcc"."outbox" ADD CONSTRAINT "outbox_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "mcc"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcc"."password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "mcc"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcc"."plan_items" ADD CONSTRAINT "plan_items_plan_id_operation_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "mcc"."operation_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcc"."sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "mcc"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcc"."sessions" ADD CONSTRAINT "sessions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "mcc"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcc"."sync_runs" ADD CONSTRAINT "sync_runs_moodle_instance_id_moodle_instances_id_fk" FOREIGN KEY ("moodle_instance_id") REFERENCES "mcc"."moodle_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcc"."sync_runs" ADD CONSTRAINT "sync_runs_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "mcc"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcc"."sync_state" ADD CONSTRAINT "sync_state_moodle_instance_id_moodle_instances_id_fk" FOREIGN KEY ("moodle_instance_id") REFERENCES "mcc"."moodle_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcc"."system_settings" ADD CONSTRAINT "system_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "mcc"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcc"."tenant_members" ADD CONSTRAINT "tenant_members_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "mcc"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcc"."tenant_members" ADD CONSTRAINT "tenant_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "mcc"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcc"."tenant_settings" ADD CONSTRAINT "tenant_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "mcc"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcc"."user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "mcc"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcc"."user_roles" ADD CONSTRAINT "user_roles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "mcc"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcc"."user_roles" ADD CONSTRAINT "user_roles_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "mcc"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_call_log_instance_idx" ON "mcc"."api_call_log" USING btree ("moodle_instance_id","created_at");--> statement-breakpoint
CREATE INDEX "api_call_log_fn_idx" ON "mcc"."api_call_log" USING btree ("fn","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "api_keys_hash_unique" ON "mcc"."api_keys" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "api_keys_tenant_idx" ON "mcc"."api_keys" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "audit_logs_tenant_idx" ON "mcc"."audit_logs" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_idx" ON "mcc"."audit_logs" USING btree ("actor_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_resource_idx" ON "mcc"."audit_logs" USING btree ("resource_type","resource_id");--> statement-breakpoint
CREATE INDEX "audit_logs_action_idx" ON "mcc"."audit_logs" USING btree ("action","created_at");--> statement-breakpoint
CREATE INDEX "job_errors_job_idx" ON "mcc"."job_errors" USING btree ("job_id","created_at");--> statement-breakpoint
CREATE INDEX "jobs_tenant_idx" ON "mcc"."jobs" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "jobs_status_idx" ON "mcc"."jobs" USING btree ("tenant_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_bull_unique" ON "mcc"."jobs" USING btree ("bull_job_id") WHERE "mcc"."jobs"."bull_job_id" is not null;--> statement-breakpoint
CREATE INDEX "login_attempts_email_idx" ON "mcc"."login_attempts" USING btree ("email","created_at");--> statement-breakpoint
CREATE INDEX "login_attempts_ip_idx" ON "mcc"."login_attempts" USING btree ("ip_address","created_at");--> statement-breakpoint
CREATE INDEX "moodle_capability_snapshots_instance_idx" ON "mcc"."moodle_capability_snapshots" USING btree ("instance_id","probed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "moodle_credentials_instance_unique" ON "mcc"."moodle_credentials" USING btree ("instance_id");--> statement-breakpoint
CREATE INDEX "moodle_health_instance_idx" ON "mcc"."moodle_health_checks" USING btree ("instance_id","checked_at");--> statement-breakpoint
CREATE INDEX "moodle_instances_tenant_idx" ON "mcc"."moodle_instances" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "moodle_instances_tenant_name_unique" ON "mcc"."moodle_instances" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "mcc"."notifications" USING btree ("user_id","read_at","created_at");--> statement-breakpoint
CREATE INDEX "operation_plans_tenant_idx" ON "mcc"."operation_plans" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "operation_plans_status_idx" ON "mcc"."operation_plans" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "operation_plans_idempotency_unique" ON "mcc"."operation_plans" USING btree ("tenant_id","idempotency_key") WHERE "mcc"."operation_plans"."idempotency_key" is not null;--> statement-breakpoint
CREATE INDEX "outbox_unpublished_idx" ON "mcc"."outbox" USING btree ("published_at") WHERE "mcc"."outbox"."published_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "password_reset_hash_unique" ON "mcc"."password_reset_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_items_plan_ordinal_unique" ON "mcc"."plan_items" USING btree ("plan_id","ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_items_natural_key_unique" ON "mcc"."plan_items" USING btree ("plan_id","natural_key");--> statement-breakpoint
CREATE INDEX "plan_items_resume_idx" ON "mcc"."plan_items" USING btree ("plan_id","state","ordinal");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "mcc"."sessions" USING btree ("user_id","revoked_at");--> statement-breakpoint
CREATE INDEX "sessions_family_idx" ON "mcc"."sessions" USING btree ("family_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_refresh_hash_unique" ON "mcc"."sessions" USING btree ("refresh_token_hash");--> statement-breakpoint
CREATE INDEX "sync_runs_instance_idx" ON "mcc"."sync_runs" USING btree ("moodle_instance_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sync_state_instance_entity_unique" ON "mcc"."sync_state" USING btree ("moodle_instance_id","entity");--> statement-breakpoint
CREATE UNIQUE INDEX "tenants_slug_unique" ON "mcc"."tenants" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "user_roles_unique" ON "mcc"."user_roles" USING btree ("user_id","tenant_id","role_key","scope_type",coalesce("scope_id", '00000000-0000-0000-0000-000000000000'::uuid));--> statement-breakpoint
CREATE INDEX "user_roles_tenant_idx" ON "mcc"."user_roles" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "mcc"."users" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "dim_activity_natural_key_unique" ON "dw"."dim_activity" USING btree ("moodle_instance_id","moodle_id");--> statement-breakpoint
CREATE INDEX "dim_activity_course_idx" ON "dw"."dim_activity" USING btree ("moodle_instance_id","course_moodle_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dim_category_natural_key_unique" ON "dw"."dim_category" USING btree ("moodle_instance_id","moodle_id");--> statement-breakpoint
CREATE INDEX "dim_category_path_idx" ON "dw"."dim_category" USING btree ("moodle_instance_id","path");--> statement-breakpoint
CREATE UNIQUE INDEX "dim_cohort_natural_key_unique" ON "dw"."dim_cohort" USING btree ("moodle_instance_id","moodle_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dim_course_natural_key_unique" ON "dw"."dim_course" USING btree ("moodle_instance_id","moodle_id","valid_from");--> statement-breakpoint
CREATE INDEX "dim_course_current_idx" ON "dw"."dim_course" USING btree ("moodle_instance_id","is_current");--> statement-breakpoint
CREATE INDEX "dim_course_tenant_idx" ON "dw"."dim_course" USING btree ("tenant_id","is_current");--> statement-breakpoint
CREATE INDEX "dim_course_period_idx" ON "dw"."dim_course" USING btree ("period_id","is_current");--> statement-breakpoint
CREATE INDEX "dim_course_shortname_idx" ON "dw"."dim_course" USING btree ("moodle_instance_id","short_name");--> statement-breakpoint
CREATE UNIQUE INDEX "dim_group_natural_key_unique" ON "dw"."dim_group" USING btree ("moodle_instance_id","moodle_id");--> statement-breakpoint
CREATE INDEX "dim_group_course_idx" ON "dw"."dim_group" USING btree ("moodle_instance_id","course_moodle_id");--> statement-breakpoint
CREATE INDEX "dim_moodle_instance_tenant_idx" ON "dw"."dim_moodle_instance" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dim_period_tenant_code_unique" ON "dw"."dim_period" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "dim_user_natural_key_unique" ON "dw"."dim_user" USING btree ("moodle_instance_id","moodle_id","valid_from");--> statement-breakpoint
CREATE INDEX "dim_user_current_idx" ON "dw"."dim_user" USING btree ("moodle_instance_id","is_current","last_access");--> statement-breakpoint
CREATE INDEX "dim_user_tenant_idx" ON "dw"."dim_user" USING btree ("tenant_id","is_current");--> statement-breakpoint
CREATE INDEX "dim_user_name_idx" ON "dw"."dim_user" USING btree ("moodle_instance_id","full_name");--> statement-breakpoint
CREATE UNIQUE INDEX "fact_access_daily_unique" ON "dw"."fact_access_daily" USING btree ("moodle_instance_id","user_dim_id","day");--> statement-breakpoint
CREATE INDEX "fact_access_daily_day_idx" ON "dw"."fact_access_daily" USING btree ("moodle_instance_id","day","active");--> statement-breakpoint
CREATE INDEX "fact_completion_course_idx" ON "dw"."fact_completion" USING btree ("course_dim_id");--> statement-breakpoint
CREATE INDEX "fact_completion_user_idx" ON "dw"."fact_completion" USING btree ("user_dim_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fact_course_snapshot_unique" ON "dw"."fact_course_snapshot" USING btree ("course_dim_id","day");--> statement-breakpoint
CREATE INDEX "fact_course_snapshot_day_idx" ON "dw"."fact_course_snapshot" USING btree ("moodle_instance_id","day");--> statement-breakpoint
CREATE INDEX "fact_enrolment_course_idx" ON "dw"."fact_enrolment" USING btree ("course_dim_id","is_current","status");--> statement-breakpoint
CREATE INDEX "fact_enrolment_user_idx" ON "dw"."fact_enrolment" USING btree ("user_dim_id","is_current");--> statement-breakpoint
CREATE INDEX "fact_enrolment_tenant_idx" ON "dw"."fact_enrolment" USING btree ("tenant_id","is_current");--> statement-breakpoint
CREATE INDEX "fact_grade_course_idx" ON "dw"."fact_grade" USING btree ("course_dim_id","user_dim_id");--> statement-breakpoint
CREATE INDEX "fact_grade_user_idx" ON "dw"."fact_grade" USING btree ("user_dim_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fact_user_risk_daily_unique" ON "dw"."fact_user_risk_daily" USING btree ("user_dim_id","day");--> statement-breakpoint
CREATE INDEX "fact_user_risk_band_idx" ON "dw"."fact_user_risk_daily" USING btree ("moodle_instance_id","day","band");--> statement-breakpoint
CREATE INDEX "audit_logs_tenant_time_idx" ON "audit"."audit_logs" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_time_idx" ON "audit"."audit_logs" USING btree ("actor_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_resource_idx" ON "audit"."audit_logs" USING btree ("resource_type","resource_id");--> statement-breakpoint
CREATE INDEX "audit_logs_action_time_idx" ON "audit"."audit_logs" USING btree ("action","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_request_idx" ON "audit"."audit_logs" USING btree ("request_id");