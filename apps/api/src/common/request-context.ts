/**
 * Request-scoped context.
 *
 * Holds the authenticated identity and the resolved tenant for the duration of
 * one request. Guards populate it; services read it. Nothing downstream takes a
 * `tenantId` from a request body, which is what keeps a forged id from
 * reaching a query at all.
 */

import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { SessionUser } from '@mcc/shared';
import { AppError } from '@mcc/shared';
import type { Request } from 'express';

export interface RequestContext {
  readonly requestId: string;
  readonly user: SessionUser;
  readonly ip: string;
  readonly userAgent: string | undefined;
}

/** The shape attached to `request` by `RequestContextMiddleware`. */
export interface RequestWithContext extends Request {
  requestId?: string;
  context?: RequestContext;
}

export function contextOf(request: RequestWithContext): RequestContext {
  if (request.context === undefined) {
    // Reaching this means a route used the context without the middleware, which
    // is a wiring bug rather than a client mistake.
    throw new AppError({
      code: 'INTERNAL_ERROR',
      message: 'El contexto de la solicitud no está disponible.',
      context: { url: request.url },
    });
  }
  return request.context;
}

/**
 * Injects the authenticated identity into a handler parameter.
 *
 * Throws rather than returning undefined when the context is missing: a handler
 * that silently treated an unauthenticated request as anonymous is how a route
 * ends up unprotected.
 */
export const CurrentContext = createParamDecorator((_data: unknown, ctx: ExecutionContext): RequestContext => {
  return contextOf(ctx.switchToHttp().getRequest<RequestWithContext>());
});

/** Convenience accessor for the tenant id, used by every tenant-scoped service. */
export const TenantId = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  return contextOf(ctx.switchToHttp().getRequest<RequestWithContext>()).user.tenantId;
});
