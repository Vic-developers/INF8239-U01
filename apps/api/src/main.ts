/**
 * HTTP entrypoint.
 *
 * Two things happen before the server accepts traffic, and both are deliberate:
 *
 *   - the database refuses to start unless the request role cannot bypass RLS
 *   - CORS origins are validated rather than reflected
 *
 * A misconfigured isolation boundary should stop the process, not be discovered
 * by whoever finds the gap first.
 */

import 'reflect-metadata';
import { writeFileSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import type { NextFunction, Response } from 'express';
import { AppError, REQUEST_ID_HEADER } from '@mcc/shared';
import { AppModule } from './app.module.js';
import { DatabaseService } from './database/database.module.js';
import { AppExceptionFilter } from './common/app-exception.filter.js';
import { createPinoLogger } from './common/pino-logger.js';
import type { RequestWithContext } from './common/request-context.js';
import { config } from './config/configuration.js';

async function bootstrap(): Promise<void> {
  // A structured logger from the first line, so a
  // startup failure is printed in a form the log
  // pipeline can collect. The exception zone still
  // calls process.exit(1) on a startup error, but
  // the logger is present to record what it was.
  const logger = createPinoLogger('mcc-api');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger,
  });

  app.use(cookieParser());
  app.use(
    helmet({
      // The API serves JSON, never HTML, so a restrictive policy costs nothing and
      // removes a class of injection surface.
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      crossOriginEmbedderPolicy: false,
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );

  // Every response carries a request id, generated if the client did not send
  // one. It is echoed in error bodies, so a user can quote it in a report.
  app.use((req: RequestWithContext, res: Response, next: NextFunction) => {
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
    app.enableCors({ origin: true, credentials: true });
  } else {
    app.enableCors({
      origin: [...config.corsOrigins],
      // Required for the httpOnly session cookie to cross origins at all.
      credentials: true,
      exposedHeaders: [REQUEST_ID_HEADER],
    });
  }

  // Only meaningful behind a proxy; setting it without one makes every request
  // appear to come from the proxy and breaks per-IP throttling.
  if (config.TRUST_PROXY) {
    app.set('trust proxy', 1);
  }

  app.useGlobalFilters(new AppExceptionFilter());
  app.enableShutdownHooks();

  await app.get(DatabaseService).verifyIsolation();

  await app.listen(config.PORT, config.HOST);

  logger.log(`API escuchando en http://${config.HOST}:${config.PORT}`);
}

bootstrap().catch((error: unknown) => {
  // A startup failure has to be visible. `process.exit` truncates
  // asynchronous writes to a pipe, which would hide the very error
  // that stopped the process, so the detail goes to a file first.
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : String(error);
  writeFileSync('startup-error.log', `No se pudo iniciar la API:\n\n${message}\n\n${stack}\n`);
  console.error('No se pudo iniciar la API. Detalle en startup-error.log');
  process.exit(1);
});
