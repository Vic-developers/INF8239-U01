/**
 * Permission catalogue.
 *
 * Single source of truth shared by the API guards, the seed migration, the
 * frontend route metadata and the role matrix. Adding a permission here forces
 * a decision about which roles hold it (see roles.ts `ROLE_PERMISSIONS`).
 *
 * Format: `<resource>.<action>`. Actions follow read | create | update |
 * delete | execute | manage | export.
 */

export const RESOURCES = [
  'tenants',
  'users',
  'roles',
  'moodles',
  'courses',
  'categories',
  'enrolments',
  'cohorts',
  'groups',
  'activities',
  'grades',
  'completion',
  'templates',
  'periods',
  'plans',
  'jobs',
  'workflows',
  'rules',
  'reports',
  'dashboards',
  'incidents',
  'notifications',
  'audit',
  'settings',
  'apiKeys',
  'integrations',
  'analytics',
  'search',
] as const;

export type Resource = (typeof RESOURCES)[number];

export const ACTIONS = [
  'read',
  'create',
  'update',
  'delete',
  'execute',
  'manage',
  'export',
  'suspend',
] as const;

export type Action = (typeof ACTIONS)[number];

/**
 * Which actions are meaningful per resource. Guards reject unknown
 * combinations at startup so a typo cannot silently create a permission that
 * no role holds.
 */
const RESOURCE_ACTIONS = {
  tenants: ['read', 'create', 'update', 'delete', 'manage'],
  users: ['read', 'create', 'update', 'delete', 'export', 'manage', 'suspend'],
  roles: ['read', 'manage'],
  moodles: ['read', 'create', 'update', 'delete', 'manage', 'execute'],
  courses: ['read', 'create', 'update', 'delete', 'export', 'manage', 'execute'],
  categories: ['read', 'create', 'update', 'delete', 'export', 'manage'],
  enrolments: ['read', 'create', 'delete', 'execute', 'export'],
  cohorts: ['read', 'create', 'update', 'delete', 'manage', 'export'],
  groups: ['read', 'create', 'update', 'delete', 'manage', 'export'],
  activities: ['read', 'create', 'update', 'delete', 'execute', 'manage'],
  grades: ['read', 'export'],
  completion: ['read', 'export'],
  templates: ['read', 'create', 'update', 'delete', 'manage', 'execute'],
  periods: ['read', 'create', 'update', 'delete', 'manage', 'execute'],
  plans: ['read', 'create', 'execute', 'delete'],
  jobs: ['read', 'execute', 'delete'],
  workflows: ['read', 'create', 'update', 'delete', 'execute', 'manage'],
  rules: ['read', 'create', 'update', 'delete', 'manage', 'execute'],
  reports: ['read', 'create', 'update', 'delete', 'execute', 'export'],
  dashboards: ['read', 'create', 'update', 'delete', 'manage'],
  incidents: ['read', 'create', 'update', 'delete', 'manage'],
  notifications: ['read', 'create', 'update', 'manage'],
  audit: ['read', 'export'],
  settings: ['read', 'update', 'manage'],
  apiKeys: ['read', 'create', 'delete', 'manage'],
  integrations: ['read', 'create', 'update', 'delete', 'manage'],
  // `users.suspend` is separate from users.update so a role can toggle
  // enrolment state without being able to edit profile fields or roles.
  analytics: ['read', 'export'],
  search: ['read'],
} as const satisfies Record<Resource, readonly Action[]>;

export type Permission = `${Resource}.${Action}`;

function buildPermissions(): readonly Permission[] {
  const result: Permission[] = [];
  for (const resource of RESOURCES) {
    for (const action of RESOURCE_ACTIONS[resource]) {
      result.push(`${resource}.${action}`);
    }
  }
  return Object.freeze(result);
}

/** Every valid permission string, sorted for deterministic seeding. */
export const PERMISSIONS: readonly Permission[] = Object.freeze(
  [...buildPermissions()].sort((a, b) => a.localeCompare(b)),
);

const PERMISSION_SET = new Set<string>(PERMISSIONS);

export function isPermission(value: string): value is Permission {
  return PERMISSION_SET.has(value);
}

export function parsePermission(value: string): Permission {
  if (!isPermission(value)) {
    throw new Error(
      `Unknown permission "${value}". Expected <resource>.<action> from the documented catalogue.`,
    );
  }
  return value;
}

/** A set of permissions with an explicit deny set, used by guards. */
export interface PermissionSet {
  readonly allow: ReadonlySet<Permission>;
  readonly deny: ReadonlySet<Permission>;
}

/**
 * Builds a permission set from role definitions. A leading `-` marks an
 * explicit deny, which always wins over allow.
 */
export function toPermissionSet(permissions: Iterable<string>): PermissionSet {
  const allow = new Set<Permission>();
  const deny = new Set<Permission>();
  for (const raw of permissions) {
    const isDeny = raw.startsWith('-');
    const permission = parsePermission(isDeny ? raw.slice(1) : raw);
    if (isDeny) {
      deny.add(permission);
    } else {
      allow.add(permission);
    }
  }
  return { allow, deny };
}

export function hasPermission(set: PermissionSet, permission: Permission): boolean {
  if (set.deny.has(permission)) return false;
  return set.allow.has(permission);
}

export function hasAllPermissions(set: PermissionSet, permissions: readonly Permission[]): boolean {
  return permissions.every((permission) => hasPermission(set, permission));
}

export function hasAnyPermission(set: PermissionSet, permissions: readonly Permission[]): boolean {
  return permissions.some((permission) => hasPermission(set, permission));
}