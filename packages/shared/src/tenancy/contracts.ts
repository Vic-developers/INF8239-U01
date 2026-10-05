/**
 * Tenancy contracts.
 *
 * Tenant resolution order: explicit header → user's last active tenant. The
 * resolved id is written to `app.tenant_id` for the duration of the request
 * transaction, and Row Level Security uses it as the enforcement boundary.
 */

import { z } from 'zod';

export const TENANT_HEADER = 'x-mcc-tenant';
export const REQUEST_ID_HEADER = 'x-request-id';

export const TENANT_STATUSES = ['active', 'suspended', 'trial'] as const;
export type TenantStatus = (typeof TENANT_STATUSES)[number];

export const tenantSlugSchema = z
  .string()
  .min(3)
  .max(63)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, digits and single hyphens');

export const tenantSchema = z.object({
  id: z.string().uuid(),
  slug: tenantSlugSchema,
  name: z.string().min(2).max(120),
  status: z.enum(TENANT_STATUSES),
  timezone: z.string().min(1).max(64).default('UTC'),
  locale: z.string().min(2).max(10).default('es'),
  settings: z.record(z.unknown()).default({}),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Tenant = z.infer<typeof tenantSchema>;

export const createTenantSchema = z.object({
  name: z.string().min(2).max(120),
  slug: tenantSlugSchema.optional(),
  timezone: z.string().min(1).max(64).default('UTC'),
  locale: z.string().min(2).max(10).default('es'),
});
export type CreateTenantInput = z.infer<typeof createTenantSchema>;

export const updateTenantSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  status: z.enum(TENANT_STATUSES).optional(),
  timezone: z.string().min(1).max(64).optional(),
  locale: z.string().min(2).max(10).optional(),
  settings: z.record(z.unknown()).optional(),
});
export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;

export const USER_STATUSES = ['active', 'invited', 'disabled', 'locked'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const emailSchema = z
  .string()
  .min(5)
  .max(254)
  .email()
  .transform((value) => value.trim().toLowerCase());

/**
 * Password policy: length-first, no composition rules, and a breach-list hook.
 * Deliberately avoids mandatory symbols/classes: those push users toward
 * predictable substitutions without measurably raising resistance.
 */
export const passwordSchema = z
  .string()
  .min(12, 'La contraseña debe tener al menos 12 caracteres')
  .max(200, 'La contraseña no puede superar los 200 caracteres');

export const publicUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string(),
  status: z.enum(USER_STATUSES),
  locale: z.string(),
  timezone: z.string(),
  mfaEnabled: z.boolean(),
  lastLoginAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type PublicUser = z.infer<typeof publicUserSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'La contraseña es obligatoria').max(200),
  tenantSlug: tenantSlugSchema.optional(),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const sessionUserSchema = z.object({
  user: publicUserSchema,
  tenantId: z.string().uuid(),
  tenantName: z.string(),
  roles: z.array(z.string()),
  permissions: z.array(z.string()),
  /** Instance-scoped roles, keyed by moodle instance id. */
  scopedRoles: z.record(z.array(z.string())),
});
export type SessionUser = z.infer<typeof sessionUserSchema>;