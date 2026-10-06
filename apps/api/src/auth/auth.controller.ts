/**
 * Auth routes.
 *
 * The access token is delivered twice: as a cookie for the browser, so no token
 * ever sits in JavaScript where an XSS could read it, and in the body for
 * scripts and API clients that cannot use cookies.
 *
 * The refresh token is only ever a cookie, marked httpOnly and SameSite=Strict.
 * Returning it in a response body would defeat the point of storing it hashed.
 */

import { Body, Controller, Get, HttpCode, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { loginSchema } from '@mcc/shared';
import type { LoginInput, SessionUser } from '@mcc/shared';
import { AuthService, type ClientInfo } from './auth.service.js';
import { CurrentContext, type RequestContext } from '../common/request-context.js';
import { zodPipe } from '../common/zod-validation.pipe.js';
import { Public } from './route-metadata.js';
import { config } from '../config/configuration.js';

const REFRESH_COOKIE = 'mcc_refresh';
const SESSION_COOKIE = 'mcc_session';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @Public()
  @HttpCode(200)
  async login(
    @Body(zodPipe(loginSchema)) body: LoginInput,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Record<string, unknown>> {
    const result = await this.auth.login(body, clientOf(request));

    if (result.status === 'tenant_selection_required') {
      return {
        status: result.status,
        tenants: result.tenants,
        message: 'Tu cuenta pertenece a varias organizaciones. Elige una para continuar.',
      };
    }

    this.setCookies(response, result.accessToken, result.refreshToken);

    return {
      status: 'authenticated',
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
      ...publicSession(result.session),
    };
  }

  /**
   * Re-checks the session on demand, so the client can restore state after a
   * reload without re-authenticating.
   */
  @Get('session')
  session(@CurrentContext() context: RequestContext): SessionUser {
    return context.user;
  }

  @Post('refresh')
  @Public()
  @HttpCode(200)
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Record<string, unknown>> {
    const refreshToken = this.readRefreshCookie(request);
    if (refreshToken === undefined) {
      throw new UnauthorizedException('No hay sesión que renovar.');
    }

    const result = await this.auth.refresh(refreshToken, clientOf(request));
    this.setCookies(response, result.accessToken, result.refreshToken);

    return {
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
      ...publicSession(result.session),
    };
  }

  /**
   * Signs out.
   *
   * Always answers 204, even with no cookie. Reporting "you were not signed in"
   * would let a caller enumerate valid sessions.
   */
  @Post('logout')
  @Public()
  @HttpCode(204)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const refreshToken = this.readRefreshCookie(request);
    if (refreshToken !== undefined) {
      await this.auth.logout(refreshToken);
    }
    this.clearCookies(response);
  }

  private readRefreshCookie(request: Request): string | undefined {
    const cookies = request.cookies as Record<string, string> | undefined;
    const value = cookies?.[REFRESH_COOKIE];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  private setCookies(response: Response, accessToken: string, refreshToken: string): void {
    response.cookie(SESSION_COOKIE, accessToken, this.cookieOptions(config.ACCESS_TOKEN_TTL_SECONDS));
    response.cookie(REFRESH_COOKIE, refreshToken, this.cookieOptions(config.SESSION_TTL_SECONDS));
  }

  private clearCookies(response: Response): void {
    const options = this.cookieOptions(0);
    response.clearCookie(SESSION_COOKIE, options);
    response.clearCookie(REFRESH_COOKIE, options);
  }

  private cookieOptions(maxAgeSeconds: number): {
    httpOnly: true;
    secure: boolean;
    sameSite: 'strict';
    path: string;
    maxAge: number;
    domain?: string;
  } {
    return {
      httpOnly: true,
      secure: config.COOKIE_SECURE,
      // Strict, not Lax: no legitimate cross-site navigation needs this cookie, and
      // Lax would allow it to ride along on a top-level GET from another origin.
      sameSite: 'strict',
      path: '/',
      maxAge: maxAgeSeconds * 1000,
      ...(config.COOKIE_DOMAIN !== undefined ? { domain: config.COOKIE_DOMAIN } : {}),
    };
  }
}

function clientOf(request: Request): ClientInfo {
  return {
    ip: request.ip ?? 'unknown',
    // Express 5 does not type `userAgent` on the request; it is a
    // header, so it is read as one.
    userAgent: request.headers['user-agent'],
  };
}

/**
 * The client-facing view of a session.
 *
 * `permissions` is included because the UI uses it to decide what to render, and
 * hiding it would only push the same role data into a second endpoint. It grants
 * no access on its own: every route is still checked server-side.
 */
function publicSession(session: SessionUser): Record<string, unknown> {
  return {
    user: session.user,
    tenant: { id: session.tenantId, name: session.tenantName },
    roles: session.roles,
    permissions: session.permissions,
  };
}
