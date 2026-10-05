import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import type * as mccSchema from './schema/mcc.js';
import type * as dwSchema from './schema/dw.js';

/** Inferred row types for the control plane. */
export type TenantRow = InferSelectModel<typeof mccSchema.tenants>;
export type NewTenant = InferInsertModel<typeof mccSchema.tenants>;

export type UserRow = InferSelectModel<typeof mccSchema.users>;
export type NewUser = InferInsertModel<typeof mccSchema.users>;

export type TenantMemberRow = InferSelectModel<typeof mccSchema.tenantMembers>;
export type UserRoleRow = InferSelectModel<typeof mccSchema.userRoles>;

export type MoodleInstanceRow = InferSelectModel<typeof mccSchema.moodleInstances>;
export type NewMoodleInstance = InferInsertModel<typeof mccSchema.moodleInstances>;

export type MoodleCredentialRow = InferSelectModel<typeof mccSchema.moodleCredentials>;
export type NewMoodleCredential = InferInsertModel<typeof mccSchema.moodleCredentials>;

export type MoodleCapabilitySnapshotRow = InferSelectModel<
  typeof mccSchema.moodleCapabilitySnapshots
>;
export type MoodleHealthCheckRow = InferSelectModel<typeof mccSchema.moodleHealthChecks>;

export type SessionRow = InferSelectModel<typeof mccSchema.sessions>;
export type NewSession = InferInsertModel<typeof mccSchema.sessions>;

export type OperationPlanRow = InferSelectModel<typeof mccSchema.operationPlans>;
export type NewOperationPlan = InferInsertModel<typeof mccSchema.operationPlans>;
export type PlanItemRow = InferSelectModel<typeof mccSchema.planItems>;

export type JobRow = InferSelectModel<typeof mccSchema.jobs>;
export type NewJob = InferInsertModel<typeof mccSchema.jobs>;
export type JobErrorRow = InferSelectModel<typeof mccSchema.jobErrors>;

export type NotificationRow = InferSelectModel<typeof mccSchema.notifications>;
export type SyncStateRow = InferSelectModel<typeof mccSchema.syncState>;
export type ApiCallLogRow = InferSelectModel<typeof mccSchema.apiCallLog>;

/** Inferred row types for the analytics store. */
export type DimUserRow = InferSelectModel<typeof dwSchema.dimUser>;
export type DimCourseRow = InferSelectModel<typeof dwSchema.dimCourse>;
export type DimCategoryRow = InferSelectModel<typeof dwSchema.dimCategory>;
export type DimActivityRow = InferSelectModel<typeof dwSchema.dimActivity>;
export type FactEnrolmentRow = InferSelectModel<typeof dwSchema.factEnrolment>;
export type FactGradeRow = InferSelectModel<typeof dwSchema.factGrade>;
export type FactCompletionRow = InferSelectModel<typeof dwSchema.factCompletion>;
export type FactUserRiskDailyRow = InferSelectModel<typeof dwSchema.factUserRiskDaily>;

/** Never selected in full: contains the password hash. */
export type UserWithSecretRow = Pick<
  UserRow,
  'id' | 'email' | 'name' | 'passwordHash' | 'status' | 'locale' | 'timezone' | 'mfaEnabled'
>;

/** Password hashes must never reach a client. */
export function toPublicUser(row: UserRow): {
  id: string;
  email: string;
  name: string;
  status: string;
  locale: string;
  timezone: string;
  mfaEnabled: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
} {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    status: row.status,
    locale: row.locale,
    timezone: row.timezone,
    mfaEnabled: row.mfaEnabled,
    lastLoginAt: row.lastLoginAt,
    createdAt: row.createdAt,
  };
}