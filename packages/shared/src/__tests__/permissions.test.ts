import { describe, expect, it } from 'vitest';
import {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  hasPermission,
  isPermission,
  isRole,
  parsePermission,
  toPermissionSet,
} from '../index.js';
import { ROLES } from '../auth/roles.js';

describe('permission catalogue', () => {
  it('exposes unique, well-formed permissions', () => {
    expect(new Set(PERMISSIONS).size).toBe(PERMISSIONS.length);
    for (const permission of PERMISSIONS) {
      expect(permission).toMatch(/^[a-zA-Z]+\.[a-z]+$/);
    }
  });

  it('rejects unknown permissions instead of silently allowing them', () => {
    expect(isPermission('users.read')).toBe(true);
    expect(isPermission('users.teleport')).toBe(false);
    expect(isPermission('nonsense')).toBe(false);
    expect(() => parsePermission('users.teleport')).toThrow(/Unknown permission/);
  });

  it('includes the permissions named in the product specification', () => {
    for (const required of [
      'courses.read',
      'courses.create',
      'courses.update',
      'courses.delete',
      'users.read',
      'users.create',
      'users.update',
      'users.delete',
      'enrolments.read',
      'enrolments.create',
      'enrolments.delete',
      'reports.read',
      'reports.create',
      'workflows.read',
      'workflows.create',
      'workflows.execute',
    ]) {
      expect(PERMISSIONS).toContain(required);
    }
  });
});

describe('role matrix', () => {
  it('references only real permissions', () => {
    for (const role of ROLES) {
      for (const entry of ROLE_PERMISSIONS[role]) {
        const isDeny = entry.startsWith('-');
        const bare = isDeny ? entry.slice(1) : entry;
        expect(isPermission(bare), `${role} references ${bare}`).toBe(true);
      }
    }
  });

  it('does not deny a permission the same role grants', () => {
    for (const role of ROLES) {
      const set = toPermissionSet(ROLE_PERMISSIONS[role]);
      for (const permission of set.deny) {
        expect(
          set.allow.has(permission),
          `${role} both allows and denies ${permission}`,
        ).toBe(false);
      }
    }
  });

  it('gives every role the tenant baseline', () => {
    for (const role of ROLES) {
      const set = toPermissionSet(ROLE_PERMISSIONS[role]);
      expect(hasPermission(set, 'search.read'), role).toBe(true);
      expect(hasPermission(set, 'moodles.read'), role).toBe(true);
    }
  });

  it('restricts viewers and auditors from mutating academic data', () => {
    for (const role of ['viewer', 'auditor'] as const) {
      const set = toPermissionSet(ROLE_PERMISSIONS[role]);
      expect(hasPermission(set, 'courses.create'), role).toBe(false);
      expect(hasPermission(set, 'enrolments.create'), role).toBe(false);
      expect(hasPermission(set, 'plans.execute'), role).toBe(false);
    }
  });

  it('keeps audit logs away from viewers', () => {
    expect(hasPermission(toPermissionSet(ROLE_PERMISSIONS.viewer), 'audit.read')).toBe(false);
    expect(hasPermission(toPermissionSet(ROLE_PERMISSIONS.auditor), 'audit.read')).toBe(true);
  });

  it('grants super admin the full catalogue', () => {
    const set = toPermissionSet(ROLE_PERMISSIONS.super_admin);
    for (const permission of PERMISSIONS) {
      expect(hasPermission(set, permission), permission).toBe(true);
    }
  });

  it('recognises only the nine defined roles', () => {
    expect(ROLES).toHaveLength(9);
    expect(isRole('tenant_admin')).toBe(true);
    expect(isRole('root')).toBe(false);
  });
});