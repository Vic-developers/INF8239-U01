/**
 * Session guard.
 *
 * Access tokens are short-lived and self-contained; sessions live server-side so
 * revocation is immediate. That means every authenticated request costs one
 * session lookup, which is the deliberate trade: a stateless token that stays
 * valid after an administrator revokes a user's access is not revokable access.
 *
 * The lookup is keyed on the session id carried in the token and constrained to
 * the same user, so a token cannot be replayed against a different account.
 *
 * Route metadata is read with `Reflect.getMetadata` directly rather than through
 * the `Reflector` service: `Reflector` is a thin wrapper over the same call, and
 * reading it here keeps the guard to dependencies that carry real state.
 */

import { CanActivate, Injectable, type ExecutionContext } from '@nestjs/common';
import { and, eq, gt, inArray, isNull } from 'drizzle-orm';
import { withTenant } from '@mcc/db';
import { rolePermissions, sessions, tenantMembers, tenants, userRoles, users } from '@mcc/db/schema';
import { AppError, type SessionUser } from '@mcc/shared';
import { DatabaseService } from '../database/database.module.js';
import type { RequestWithContext } from '../common/request-context.js';
import { TokenService, type VerifiedToken } from './token.service.js';
import { PUBLIC_ROUTE_KEY } from './route-metadata.js';

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly tokens: TokenService,
    private readonly database: DatabaseService,
  ) {}

  async canActivate(host: ExecutionContext): Promise<boolean> {
    const request = host.switchToHttp().getRequest<RequestWithContext>();
    const isPublic = isPublicRoute(host);

    const token = this.extractToken(request);

    if (token === null) {
      if (isPublic) return true;

      throw new AppError({
        code: 'UNAUTHENTICATED',
        message: 'Necesitas iniciar sesión para continuar.',
        remediation: { action: 'Iniciar sesión', href: '/login' },
      });
    }

    const verified = this.tokens.verifyAccessToken(token);

    if (isPublic) {
      // Login and refresh carry no identity by design: the credentials in the
      // request are what is being verified. A token being present must not change
      // what those routes do.
      return true;
    }

    request.context = {
      requestId: request.requestId ?? 'unknown',
      user: await this.loadSessionUser(verified),
      ip: request.ip ?? 'unknown',
      userAgent: request.headers['user-agent'],
    };

    return true;
  }

  /**
   * Reads the bearer token, or the httpOnly cookie.
   *
   * The cookie exists so the browser client never holds a token in JavaScript,
   * where any XSS could read it. The header stays accepted for scripts and API
   * integrations.
   */
  private extractToken(request: RequestWithContext): string | null {
    const authorization = request.headers.authorization;
    if (typeof authorization === 'string' && authorization.startsWith('Bearer ')) {
      const value = authorization.slice('Bearer '.length).trim();
      if (value.length > 0) return value;
    }

    const cookies = request.cookies as Record<string, string> | undefined;
    const cookieToken = cookies?.['mcc_session'];
    return typeof cookieToken === 'string' && cookieToken.length > 0 ? cookieToken : null;
  }

  /**
   * Confirms the session is live, then loads the identity with its
   * permissions.
   *
   * The session row is tenant-scoped, so it is invisible to the request
   * role without an active scope. The access token carries the tenant —
   * it is signed, so a client cannot assert a tenant it holds no
   * session in — which is what breaks the cycle of needing the session
   * in order to know the tenant. The lookup therefore runs inside that
   * scope, on the request pool, not the platform one.
   */
  private async loadSessionUser(verified: VerifiedToken): Promise<SessionUser> {
    const rows = await withTenant(
      this.database.db,
      { tenantId: verified.tenantId },
      async (tx) =>
        tx
          .select({
            sessionId: sessions.id,
            tenantId: sessions.tenantId,
          })
          .from(sessions)
          .where(
            and(
              eq(sessions.id, verified.sessionId),
              eq(sessions.userId, verified.userId),
              isNull(sessions.revokedAt),
              gt(sessions.expiresAt, new Date()),
            ),
          )
          .limit(1),
    );

    const session = rows[0];
    if (!session) {
      throw new AppError({
        code: 'SESSION_EXPIRED',
        message: 'Tu sesión ya no es válida.',
        remediation: { action: 'Iniciar sesión de nuevo', href: '/login' },
      });
    }

    if (session.tenantId === null) {
      // A session with no tenant is the pre-selection state. It has no
      // access token, so reaching it here means a forged or stale token.
      throw new AppError({
        code: 'SESSION_EXPIRED',
        message: 'Tu sesión ya no es válida.',
        remediation: { action: 'Iniciar sesión de nuevo', href: '/login' },
      });
    }

    // The token asserts a tenant; the session must live in that tenant.
    // A mismatch means the session was moved or the token is stale.
    if (session.tenantId !== verified.tenantId) {
      throw new AppError({
        code: 'SESSION_EXPIRED',
        message: 'Tu sesión ya no es válida.',
        remediation: { action: 'Iniciar sesión de nuevo', href: '/login' },
      });
    }

    return this.hydrateUser(verified.userId, session.tenantId);
  }

  /**
   * Builds the session payload inside the tenant scope.
   *
   * Membership is re-checked here rather than trusted from the session row: a user
   * removed from a tenant must lose access on their next request, not whenever
   * their session happens to expire.
   */
  private async hydrateUser(userId: string, tenantId: string): Promise<SessionUser> {
    return withTenant(this.database.db, { tenantId, actorId: userId }, async (tx) => {
      const [identity] = await tx
        .select({
          id: users.id,
          email: users.email,
          name: users.name,
          status: users.status,
          locale: users.locale,
          timezone: users.timezone,
          mfaEnabled: users.mfaEnabled,
          lastLoginAt: users.lastLoginAt,
          createdAt: users.createdAt,
          tenantName: tenants.name,
          memberStatus: tenantMembers.status,
        })
        .from(users)
        .innerJoin(tenants, eq(tenants.id, tenantId))
        .innerJoin(
          tenantMembers,
          and(eq(tenantMembers.userId, userId), eq(tenantMembers.tenantId, tenantId)),
        )
        .where(eq(users.id, userId))
        .limit(1);

      if (!identity) {
        throw new AppError({
          code: 'CROSS_TENANT_ACCESS',
          message: 'Ya no tienes acceso a esta organización.',
          remediation: { action: 'Iniciar sesión de nuevo', href: '/login' },
        });
      }

      if (identity.status !== 'active' || identity.memberStatus !== 'active') {
        throw new AppError({
          code: 'ACCOUNT_DISABLED',
          message: 'Tu cuenta está desactivada.',
        });
      }

      const assignments = await tx
        .select({
          roleKey: userRoles.roleKey,
          scopeType: userRoles.scopeType,
          scopeId: userRoles.scopeId,
        })
        .from(userRoles)
        .where(eq(userRoles.userId, userId));

      const roleKeys = [...new Set(assignments.map((row) => row.roleKey))];

      // Permissions are read from the table rather than from the compiled
      // catalogue, so revoking one takes effect without a redeploy.
      const permissions =
        roleKeys.length === 0
          ? []
          : (
              await tx
                .select({
                  permissionKey: rolePermissions.permissionKey,
                  granted: rolePermissions.granted,
                })
                .from(rolePermissions)
                .where(inArray(rolePermissions.roleKey, roleKeys))
            )
              .filter((grant) => grant.granted)
              .map((grant) => grant.permissionKey);

      const scopedRoles: Record<string, string[]> = {};
      for (const assignment of assignments) {
        if (assignment.scopeType !== 'moodle_instance' || assignment.scopeId === null) continue;
        const bucket = scopedRoles[assignment.scopeId] ?? [];
        if (!bucket.includes(assignment.roleKey)) {
          bucket.push(assignment.roleKey);
          scopedRoles[assignment.scopeId] = bucket;
        }
      }

      return {
        user: {
          id: identity.id,
          email: identity.email,
          name: identity.name,
          status: identity.status,
          locale: identity.locale,
          timezone: identity.timezone,
          mfaEnabled: identity.mfaEnabled,
          lastLoginAt: identity.lastLoginAt?.toISOString() ?? null,
          createdAt: identity.createdAt.toISOString(),
        },
        tenantId,
        tenantName: identity.tenantName,
        roles: roleKeys,
        permissions,
        scopedRoles,
      } satisfies SessionUser;
    });
  }
}

/** A route is public when the handler or its controller opts out. */
function isPublicRoute(host: ExecutionContext): boolean {
  return (
    Reflect.getMetadata(PUBLIC_ROUTE_KEY, host.getHandler()) === true ||
    Reflect.getMetadata(PUBLIC_ROUTE_KEY, host.getClass()) === true
  );
}
