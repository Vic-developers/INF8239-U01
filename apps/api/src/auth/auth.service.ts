/**
 * Authentication.
 *
 * Sessions are server-side rows, refresh tokens rotate, and reuse of a rotated
 * token revokes the whole family. That combination is what makes a stolen
 * refresh token detectable rather than indefinitely useful.
 *
 * Identity lookup at login runs on the platform connection. It has to: at that
 * point no tenant is known, and the `users` table is reachable only through
 * membership, so the request role cannot see the row being authenticated. This
 * is one of the three uses `mcc_platform` exists for.
 */

import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { withPlatformScope, withTenant } from '@mcc/db';
import {
  loginAttempts,
  rolePermissions,
  sessions,
  tenantMembers,
  tenants,
  userRoles,
  users,
} from '@mcc/db/schema';
import { AppError, type LoginInput, type SessionUser } from '@mcc/shared';
import { verifyPassword } from '@mcc/shared/node/password';
import { DatabaseService, PLATFORM_DATABASE } from '../database/database.module.js';
import type { DatabasePool } from '../database/database.module.js';
import { hashOpaqueToken } from '../crypto/crypto.service.js';
import { TokenService } from './token.service.js';
import { config } from '../config/configuration.js';

/**
 * Login outcome.
 *
 * A union rather than one shape with optional fields: "authenticated" and "needs
 * a tenant chosen" have nothing in common, and a single shape with blanks would
 * let a caller read `session.user.email` from a half-built object and get an
 * empty string instead of an error.
 */
export type LoginResult =
  | {
      readonly status: 'authenticated';
      readonly accessToken: string;
      readonly expiresIn: number;
      readonly refreshToken: string;
      readonly session: SessionUser;
    }
  | {
      readonly status: 'tenant_selection_required';
      readonly tenants: readonly { id: string; name: string; slug: string }[];
    };

export interface AuthenticatedSession {
  readonly accessToken: string;
  readonly expiresIn: number;
  readonly refreshToken: string;
  readonly session: SessionUser;
}

export interface ClientInfo {
  readonly ip: string;
  readonly userAgent: string | undefined;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly database: DatabaseService,
    @Inject(PLATFORM_DATABASE) private readonly platform: DatabasePool,
    private readonly tokens: TokenService,
  ) {}

  /**
   * Authenticates and opens a session.
   *
   * Failures are deliberately indistinguishable: an unknown email and a wrong
   * password both take the same path, cost roughly the same time, and return the
   * same error. Distinguishing them turns login into an account enumeration oracle.
   */
  async login(input: LoginInput, client: ClientInfo): Promise<LoginResult> {
    const email = input.email;
    const identity = await this.lookupIdentity(email);

    if (identity === null || identity.passwordHash === null) {
      // Hash a throwaway value so a missing account costs the same as a wrong
      // password, rather than answering instantly and giving itself away.
      await verifyPassword(input.password, DUMMY_HASH);
      await this.recordAttempt(email, client, false, 'unknown_account');
      throw invalidCredentials();
    }

    const valid = await verifyPassword(input.password, identity.passwordHash);

    if (this.isLocked(identity)) {
      await this.recordAttempt(email, client, false, 'locked');
      throw new AppError({
        code: 'ACCOUNT_LOCKED',
        message: 'La cuenta está bloqueada temporalmente por intentos fallidos.',
        remediation: { action: 'Espera unos minutos e inténtalo de nuevo' },
      });
    }

    if (!valid) {
      await this.recordAttempt(email, client, false, 'bad_password');
      await this.recordFailedAttempt(identity.userId);
      throw invalidCredentials();
    }

    if (identity.userStatus !== 'active') {
      await this.recordAttempt(email, client, false, 'inactive');
      throw new AppError({
        code: 'ACCOUNT_DISABLED',
        message: 'Esta cuenta no está activa.',
      });
    }

    const memberships = await this.listMemberships(identity.userId);

    if (memberships.length === 0) {
      await this.recordAttempt(email, client, false, 'no_membership');
      throw new AppError({
        code: 'FORBIDDEN',
        message: 'Tu cuenta no pertenece a ninguna organización.',
      });
    }

    const selected =
      input.tenantSlug === undefined
        ? (memberships.length === 1 ? memberships[0] : undefined)
        : memberships.find((membership) => membership.slug === input.tenantSlug);

    if (selected === undefined) {
      if (input.tenantSlug !== undefined) {
        throw new AppError({
          code: 'TENANT_NOT_FOUND',
          message: 'No tienes acceso a esa organización.',
        });
      }
      // Several organisations and none chosen: return the list and no credential
      // at all. The client asks which one to use, then logs in again with the slug.
      await this.recordAttempt(email, client, true, 'tenant_selection_required');
      return {
        status: 'tenant_selection_required',
        tenants: memberships.map((membership) => ({
          id: membership.tenantId,
          name: membership.tenantName,
          slug: membership.slug,
        })),
      };
    }

    const authenticated = await this.openSession(identity.userId, selected.tenantId, client);
    await this.recordAttempt(email, client, true, 'ok');

    return { status: 'authenticated', ...authenticated };
  }

  /**
   * Rotates a refresh token.
   *
   * Reuse of an already-rotated token is the signal that a token escaped: both
   * the old and the new token are then treated as compromised and the entire
   * family is revoked, which logs the attacker and the legitimate user out
   * together. Silently continuing would leave the attacker in.
   */
  async refresh(refreshToken: string, client: ClientInfo): Promise<AuthenticatedSession> {
    const tokenHash = hashOpaqueToken(refreshToken, config.REFRESH_TOKEN_PEPPER);

    const rows = await this.platform.db
      .select({
        id: sessions.id,
        userId: sessions.userId,
        tenantId: sessions.tenantId,
        familyId: sessions.familyId,
        revokedAt: sessions.revokedAt,
        expiresAt: sessions.expiresAt,
      })
      .from(sessions)
      .where(eq(sessions.refreshTokenHash, tokenHash))
      .limit(1);

    const session = rows[0];

    if (!session) {
      throw new AppError({
        code: 'UNAUTHENTICATED',
        message: 'La sesión no es válida.',
        remediation: { action: 'Iniciar sesión de nuevo', href: '/login' },
      });
    }

    if (session.revokedAt !== null) {
      await this.revokeFamily(session.familyId, 'refresh_token_reuse');
      throw new AppError({
        code: 'REFRESH_TOKEN_REUSED',
        message: 'Se detectó un uso duplicado de la sesión. Por seguridad debes volver a entrar.',
        remediation: { action: 'Iniciar sesión de nuevo', href: '/login' },
      });
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      throw new AppError({
        code: 'SESSION_EXPIRED',
        message: 'Tu sesión ya expiró.',
        remediation: { action: 'Iniciar sesión de nuevo', href: '/login' },
      });
    }

    if (session.tenantId === null) {
      throw new AppError({
        code: 'TENANT_MISMATCH',
        message: 'Selecciona un tenant para continuar.',
        remediation: { action: 'Elegir tenant', href: '/select-tenant' },
      });
    }

    // Captured after the null check: the intervening `await` would
    // otherwise drop the narrowing and the type would widen back to
    // `string | null`.
    const tenantId = session.tenantId;

    // Revoke the presented token and issue its successor. Both writes in one
    // transaction, so a crash cannot leave two live tokens in the family.
    const next = await withPlatformScope(this.platform.db, async (tx) => {
      await tx
        .update(sessions)
        .set({ revokedAt: new Date(), revokedReason: 'rotated' })
        .where(eq(sessions.id, session.id));

      const newRefresh = this.tokens.generateRefreshToken();
      const [created] = await tx
        .insert(sessions)
        .values({
          userId: session.userId,
          tenantId,
          refreshTokenHash: hashOpaqueToken(newRefresh, config.REFRESH_TOKEN_PEPPER),
          familyId: session.familyId,
          ipAddress: client.ip,
          userAgent: client.userAgent ?? null,
          expiresAt: new Date(Date.now() + config.SESSION_TTL_SECONDS * 1000),
          lastSeenAt: new Date(),
        })
        .returning({ id: sessions.id });

      if (!created) throw new AppError({ code: 'INTERNAL_ERROR', message: 'No se pudo rotar la sesión.' });

      const access = this.tokens.issueAccessToken(
        created.id,
        session.userId,
        tenantId,
      );
      return { newRefresh, access };
    });

    const sessionUser = await this.buildSessionUser(session.userId, session.tenantId);

    return {
      accessToken: next.access.token,
      expiresIn: next.access.expiresIn,
      refreshToken: next.newRefresh,
      session: sessionUser,
    };
  }

  /** Revokes one session. Idempotent: signing out twice is not an error. */
  async logout(refreshToken: string): Promise<void> {
    const tokenHash = hashOpaqueToken(refreshToken, config.REFRESH_TOKEN_PEPPER);

    await withPlatformScope(this.platform.db, async (tx) => {
      await tx
        .update(sessions)
        .set({ revokedAt: new Date(), revokedReason: 'logout' })
        .where(and(eq(sessions.refreshTokenHash, tokenHash), isNull(sessions.revokedAt)));
    });
  }

  /** Revokes every live session for a user, e.g. after a password change. */
  async logoutAll(userId: string): Promise<void> {
    await withPlatformScope(this.platform.db, async (tx) => {
      await tx
        .update(sessions)
        .set({ revokedAt: new Date(), revokedReason: 'logout_all' })
        .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
    });
  }

  // ── internals ─────────────────────────────────────────────────────────────

  private async lookupIdentity(email: string): Promise<{
    userId: string;
    passwordHash: string | null;
    userStatus: string;
    failedLoginAttempts: number;
    lockedUntil: Date | null;
  } | null> {
    return withPlatformScope(this.platform.db, async (tx) => {
      const [row] = await tx
        .select({
          userId: users.id,
          passwordHash: users.passwordHash,
          userStatus: users.status,
          failedLoginAttempts: users.failedLoginAttempts,
          lockedUntil: users.lockedUntil,
        })
        .from(users)
        .where(sql`lower(${users.email}) = ${email}`)
        .limit(1);

      return row ?? null;
    });
  }

  private isLocked(identity: { lockedUntil: Date | null }): boolean {
    return identity.lockedUntil !== null && identity.lockedUntil.getTime() > Date.now();
  }

  /** Counts a failure and locks the account once the threshold is crossed. */
  private async recordFailedAttempt(userId: string): Promise<void> {
    await withPlatformScope(this.platform.db, async (tx) => {
      await tx.execute(
        sql`update ${users}
             set failed_login_attempts = failed_login_attempts + 1,
                 locked_until = case
                   when failed_login_attempts + 1 >= ${config.LOGIN_MAX_ATTEMPTS}
                     then now() + make_interval(mins => ${config.LOGIN_LOCK_MINUTES})
                   else locked_until
                 end,
                 updated_at = now()
           where id = ${userId}::uuid`,
      );
    });
  }

  private async listMemberships(
    userId: string,
  ): Promise<{ tenantId: string; tenantName: string; slug: string; status: string }[]> {
    return withPlatformScope(this.platform.db, async (tx) => {
      return tx
        .select({
          tenantId: tenants.id,
          tenantName: tenants.name,
          slug: tenants.slug,
          status: tenantMembers.status,
        })
        .from(tenantMembers)
        .innerJoin(tenants, eq(tenants.id, tenantMembers.tenantId))
        .where(and(eq(tenantMembers.userId, userId), eq(tenantMembers.status, 'active')));
    });
  }

  private async openSession(
    userId: string,
    tenantId: string,
    client: ClientInfo,
  ): Promise<AuthenticatedSession> {
    const refreshToken = this.tokens.generateRefreshToken();

    const created = await withPlatformScope(this.platform.db, async (tx) => {
      const [row] = await tx
        .insert(sessions)
        .values({
          userId,
          tenantId,
          refreshTokenHash: hashOpaqueToken(refreshToken, config.REFRESH_TOKEN_PEPPER),
          familyId: randomUUID(),
          ipAddress: client.ip,
          userAgent: client.userAgent ?? null,
          expiresAt: new Date(Date.now() + config.SESSION_TTL_SECONDS * 1000),
          lastSeenAt: new Date(),
        })
        .returning({ id: sessions.id });

      if (!row) throw new AppError({ code: 'INTERNAL_ERROR', message: 'No se pudo crear la sesión.' });

      // Best-effort: a failed login-timestamp write must not fail the login.
      await tx.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, userId));

      return row;
    });

    const access = this.tokens.issueAccessToken(created.id, userId, tenantId);

    return {
      accessToken: access.token,
      expiresIn: access.expiresIn,
      refreshToken,
      session: await this.buildSessionUser(userId, tenantId),
    };
  }

  /** Assembles the session payload, including permissions, inside the tenant scope. */
  private async buildSessionUser(userId: string, tenantId: string): Promise<SessionUser> {
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
        })
        .from(users)
        .innerJoin(tenants, eq(tenants.id, tenantId))
        .where(eq(users.id, userId))
        .limit(1);

      if (!identity) {
        throw new AppError({
          code: 'CROSS_TENANT_ACCESS',
          message: 'Ya no tienes acceso a esta organización.',
        });
      }

      const assignments = await tx
        .select({ roleKey: userRoles.roleKey })
        .from(userRoles)
        .where(and(eq(userRoles.userId, userId), eq(userRoles.tenantId, tenantId)));

      const roleKeys = [...new Set(assignments.map((row) => row.roleKey))];
      const permissions =
        roleKeys.length === 0
          ? []
          : (
              await tx
                .select({ permissionKey: rolePermissions.permissionKey, granted: rolePermissions.granted })
                .from(rolePermissions)
                .where(inArray(rolePermissions.roleKey, roleKeys))
            )
              .filter((grant) => grant.granted)
              .map((grant) => grant.permissionKey);

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
        scopedRoles: {},
      } satisfies SessionUser;
    });
  }

  private async recordAttempt(
    email: string,
    client: ClientInfo,
    successful: boolean,
    reason: string,
  ): Promise<void> {
    try {
      await withPlatformScope(this.platform.db, async (tx) => {
        await tx.insert(loginAttempts).values({
          email,
          ipAddress: client.ip,
          successful,
          failureReason: reason,
        });
      });
    } catch {
      // Throttling telemetry must never be the reason a login fails.
    }
  }

  private async revokeFamily(familyId: string, reason: string): Promise<void> {
    await withPlatformScope(this.platform.db, async (tx) => {
      await tx
        .update(sessions)
        .set({ revokedAt: new Date(), revokedReason: reason })
        .where(and(eq(sessions.familyId, familyId), isNull(sessions.revokedAt)));
    });
  }
}

function invalidCredentials(): AppError {
  return new AppError({
    code: 'INVALID_CREDENTIALS',
    message: 'Correo o contraseña incorrectos.',
  });
}

/**
 * A syntactically valid scrypt hash of a value nobody knows, used to equalise
 * timing when the account does not exist. Paying for one hash is the whole point:
 * without it a missing account answers in microseconds and a real one in ~400ms,
 * which is a perfectly good account-enumeration signal.
 *
 * The base64 fields decode to 16 zero bytes and a 32-byte value of the right
 * length, so `verifyPassword` runs the real KDF and then fails to match.
 */
const DUMMY_HASH = `scrypt$32768$8$1$${Buffer.alloc(16).toString('base64')}$${Buffer.alloc(32).toString('base64')}`;
