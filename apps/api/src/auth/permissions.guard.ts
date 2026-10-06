/**
 * Permission guard.
 *
 * Runs after `SessionGuard`, so the identity and its permissions are already
 * resolved. Both are registered as `APP_GUARD`, which is what guarantees the
 * order and means a new controller cannot forget to protect itself.
 *
 * Permissions are read from `mcc.role_permissions` rather than from the compiled
 * catalogue, so revoking one takes effect on the next request without a deploy.
 *
 * Route metadata is read with `Reflect.getMetadata` directly rather than through
 * the `Reflector` service: `Reflector` is a thin wrapper over the same call.
 */

import { CanActivate, Injectable, type ExecutionContext } from '@nestjs/common';
import { AppError, hasAllPermissions, toPermissionSet, type Permission } from '@mcc/shared';
import { contextOf, type RequestWithContext } from '../common/request-context.js';
import { PERMISSIONS_KEY, PLATFORM_ROLE_KEY } from './route-metadata.js';

@Injectable()
export class PermissionsGuard implements CanActivate {
  canActivate(host: ExecutionContext): boolean {
    const required =
      metadataOf<Permission[]>(PERMISSIONS_KEY, host) ?? undefined;
    const platformOnly =
      metadataOf<boolean>(PLATFORM_ROLE_KEY, host) === true;

    if (required === undefined && !platformOnly) {
      return true;
    }

    const request = host.switchToHttp().getRequest<RequestWithContext>();
    const { user } = contextOf(request);

    if (platformOnly && !user.roles.includes('super_admin')) {
      // Reported as a plain refusal. Platform routes are not part of a
      // tenant's surface, so their existence is not something to advertise.
      throw new AppError({
        code: 'FORBIDDEN',
        message: 'No tienes permiso para realizar esta acción.',
      });
    }

    if (required !== undefined && !hasAllPermissions(toPermissionSet(user.permissions), required)) {
      throw new AppError({
        code: 'FORBIDDEN',
        message: 'No tienes permiso para realizar esta acción.',
        remediation: { action: 'Pide a un administrador que te asigne el rol necesario' },
      });
    }

    return true;
  }
}

/** Reads a route metadata value from the handler, then the controller. */
function metadataOf<T>(key: string, host: ExecutionContext): T | null {
  const fromHandler = Reflect.getMetadata(key, host.getHandler());
  if (fromHandler !== undefined) return fromHandler as T;

  const fromClass = Reflect.getMetadata(key, host.getClass());
  if (fromClass !== undefined) return fromClass as T;

  return null;
}
