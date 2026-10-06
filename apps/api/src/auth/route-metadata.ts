/**
 * Route metadata.
 *
 * Declared in one place because two guards read it and a third decorator writes
 * it: splitting them across files is how a guard ends up looking under a key
 * nothing ever sets, and a route silently ends up unguarded.
 *
 * `PlatformOnly` and `RequirePermissions` are separate on purpose. Platform
 * authority crosses tenant boundaries; a permission belongs to a role inside one.
 * Merging them into a single "admin" flag would make the far more dangerous of
 * the two indistinguishable in review.
 */

import { SetMetadata, type CustomDecorator } from '@nestjs/common';
import { isPermission, type Permission } from '@mcc/shared';

/** Marks a route as reachable without a session. */
export const PUBLIC_ROUTE_KEY = 'mcc:public-route';
export const PERMISSIONS_KEY = 'mcc:required-permissions';
export const PLATFORM_ROLE_KEY = 'mcc:platform-only';

/**
 * Opts a route out of authentication.
 *
 * Deliberately explicit and per route. The alternative — a default-deny list or a
 * separate controller without guards — makes the unauthenticated surface something
 * you have to go looking for, and this makes it one grep away.
 */
export const Public = (): CustomDecorator<string> => SetMetadata(PUBLIC_ROUTE_KEY, true);

/**
 * Declares the permissions a route requires. All listed permissions are required;
 * there is no "any of" form, because an endpoint that runs on either of two rights
 * is an endpoint nobody can reason about.
 */
export const RequirePermissions = (...permissions: Permission[]): CustomDecorator<string> => {
  for (const permission of permissions) {
    if (!isPermission(permission)) {
      // Throws at module load, so a typo cannot ship as a route that happens to
      // be unguarded because the name matched nothing.
      throw new Error(`Unknown permission in @RequirePermissions: ${permission}`);
    }
  }
  return SetMetadata(PERMISSIONS_KEY, permissions);
};

/**
 * Restricts a route to platform administrators: tenant provisioning and
 * cross-tenant operations.
 */
export const PlatformOnly = (): CustomDecorator<string> => SetMetadata(PLATFORM_ROLE_KEY, true);
