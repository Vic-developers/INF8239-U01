/**
 * Access tokens.
 *
 * A compact HMAC-SHA256 token: `base64url(payload).base64url(signature)`. Not a
 * JWT, deliberately — nothing here needs a third-party verifier or a set of
 * registered claims, and hand-rolling removes that dependency from the security
 * path entirely.
 *
 * The signature is what stops a client from asserting a role. It is not what
 * makes a session revocable: every request re-checks the session row, so a token
 * whose session was deleted stops working immediately.
 */

import { Injectable } from '@nestjs/common';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { AppError } from '@mcc/shared';
import { config } from '../config/configuration.js';

export interface AccessTokenPayload {
  /** Session id; the guard looks the session up by this. */
  readonly sid: string;
  readonly sub: string;
  /**
   * Tenant the session belongs to. Carried in the token so the guard
   * can set the row-security scope BEFORE reading the session row:
   * the session is tenant-scoped, so it is invisible to the request
   * role without that scope. The signature makes this trustworthy —
   * a client cannot assert a tenant it does not have a session in.
   */
  readonly tid: string;
  readonly exp: number;
  /** Issued at, seconds since epoch. */
  readonly iat: number;
}

export type VerifiedToken = Readonly<{
  readonly sessionId: string;
  readonly userId: string;
  readonly tenantId: string;
  readonly expiresAt: number;
}>;

@Injectable()
export class TokenService {
  private readonly secret: string;
  private readonly ttlSeconds: number;

  constructor() {
    this.secret = config.ACCESS_TOKEN_SECRET;
    this.ttlSeconds = config.ACCESS_TOKEN_TTL_SECONDS;
  }

  /** Issues a token bound to one session in one tenant. */
  issueAccessToken(
    sessionId: string,
    userId: string,
    tenantId: string,
  ): { token: string; expiresIn: number } {
    const now = Math.floor(Date.now() / 1000);
    const payload: AccessTokenPayload = {
      sid: sessionId,
      sub: userId,
      tid: tenantId,
      iat: now,
      exp: now + this.ttlSeconds,
    };

    // `payload.signature`: the verifier splits on the dot, so both
    // halves have to travel. Signing the payload alone would yield a
    // token with nothing to verify against.
    const encoded = this.encode(payload);

    return {
      token: `${encoded}.${this.sign(encoded)}`,
      expiresIn: this.ttlSeconds,
    };
  }

  /**
   * Verifies signature and expiry.
   *
   * Every failure mode returns the same `UNAUTHENTICATED`, because which check
   * failed tells an attacker whether a guessed session id exists.
   */
  verifyAccessToken(token: string): VerifiedToken {
    const parts = token.split('.');
    if (parts.length !== 2) {
      throw this.unauthenticated();
    }

    const [encodedPayload, providedSignature] = parts;
    if (encodedPayload === undefined || providedSignature === undefined) {
      throw this.unauthenticated();
    }

    const expected = this.signature(encodedPayload);
    const provided = Buffer.from(providedSignature, 'base64url');
    const computed = Buffer.from(expected, 'base64url');

    if (provided.length !== computed.length || !timingSafeEqual(provided, computed)) {
      throw this.unauthenticated();
    }

    let payload: AccessTokenPayload;
    try {
      payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as AccessTokenPayload;
    } catch {
      throw this.unauthenticated();
    }

    if (typeof payload.exp !== 'number' || payload.exp * 1000 <= Date.now()) {
      throw new AppError({
        code: 'SESSION_EXPIRED',
        message: 'Tu sesión ya expiró.',
        remediation: { action: 'Iniciar sesión de nuevo', href: '/login' },
      });
    }

    // A malformed claim set is indistinguishable from a forged one.
    if (
      typeof payload.sid !== 'string' ||
      typeof payload.sub !== 'string' ||
      typeof payload.tid !== 'string' ||
      payload.sid.length === 0 ||
      payload.sub.length === 0 ||
      payload.tid.length === 0
    ) {
      throw this.unauthenticated();
    }

    return {
      sessionId: payload.sid,
      userId: payload.sub,
      tenantId: payload.tid,
      expiresAt: payload.exp,
    };
  }

  /** Opaque refresh token. High entropy, so it is stored hashed, not signed. */
  generateRefreshToken(): string {
    return randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');
  }

  private encode(payload: AccessTokenPayload): string {
    return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  }

  private sign(encodedPayload: string): string {
    return this.signature(encodedPayload);
  }

  private signature(encodedPayload: string): string {
    return createHmac('sha256', this.secret).update(encodedPayload).digest('base64url');
  }

  private unauthenticated(): AppError {
    return new AppError({
      code: 'UNAUTHENTICATED',
      message: 'Tu sesión no es válida.',
      remediation: { action: 'Iniciar sesión de nuevo', href: '/login' },
    });
  }
}
