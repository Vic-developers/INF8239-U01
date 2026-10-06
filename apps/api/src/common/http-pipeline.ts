/**
 * Shared HTTP pipeline.
 *
 * Everything that must run before the first controller — cookie parsing,
 * security headers, request ids, CORS, the exception filter — lives here so
 * the test harness boots the *same* middleware stack as `main.ts`.
 *
 * That matters for a specific reason: a test app created without
 * `cookieParser` would silently never populate `request.cookies`, so every
 * cookie-authenticated request would answer 401 while the login flow itself
 * kept working. Middleware differences are exactly the kind of bug an
 * in-process harness is supposed to eliminate, not introduce.
 */

import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import type { NextFunction, Request, Response } from 'express';
import { AppError, REQUEST_ID_HEADER } from '@mcc/shared';
import { AppExceptionFilter } from './app-exception.filter.js';
import type { RequestWithContext } from './request-context.js';
import { config } from '../config/configuration.js';

export function applyHttpPipeline(app: INestApplication): void {
  const express = app as NestExpressApplication;

  express.use(cookieParser());
  express.use(
    helmet({
      // The API serves JSON, never HTML, so a restrictive policy costs nothing and
      // removes a class of injection surface.
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      crossOriginEmbedderPolicy: false,
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );

  // Nothing the API serves is cacheable, and saying so is not pedantry.
  //
  // Express emits an ETag but no Cache-Control, which leaves the browser to
  // decide on its own: it stores authenticated JSON and later answers a
  // repeat request from memory. The symptoms are a UI that reports you as
  // signed in while the API answers 401 (the cached session body beats the
  // live one) and tenant data still readable from cache after logout on a
  // shared machine. `no-store` removes the decision; `Vary: Cookie` tells
  // any intermediary that ignores it that these responses differ per
  // session.
  express.use((_req: Request, res: Response, next: NextFunction) => {
    res.set('Cache-Control', 'no-store');
    res.set('Vary', 'Cookie');
    next();
  });

  // Every response carries a request id, generated if the client did not send
  // one. It is echoed in error bodies, so a user can quote it in a report.
  express.use((req: RequestWithContext, res: Response, next: NextFunction) => {
    const incoming = req.headers[REQUEST_ID_HEADER];
    const requestId =
      typeof incoming === 'string' && incoming.length > 0 && incoming.length <= 128
        ? incoming
        : crypto.randomUUID();

    req.requestId = requestId;
    res.set(REQUEST_ID_HEADER, requestId);
    next();
  });

  if (config.corsOrigins === '*') {
    if (config.isProduction) {
      throw new AppError({
        code: 'INTERNAL_ERROR',
        message: 'CORS_ORIGINS no puede ser «*» en producción.',
      });
    }
    // Reflecting the origin is only acceptable in development, where the client is
    // on another port. In production an explicit list is required.
    express.enableCors({ origin: true, credentials: true });
  } else {
    express.enableCors({
      origin: [...config.corsOrigins],
      // Required for the httpOnly session cookie to cross origins at all.
      credentials: true,
      exposedHeaders: [REQUEST_ID_HEADER],
    });
  }

  // Only meaningful behind a proxy; setting it without one makes every request
  // appear to come from the proxy and breaks per-IP throttling.
  if (config.TRUST_PROXY) {
    express.set('trust proxy', 1);
  }

  app.useGlobalFilters(new AppExceptionFilter());
  app.enableShutdownHooks();
}
