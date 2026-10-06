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
import { AppModule } from './app.module.js';
import { DatabaseService } from './database/database.module.js';
import { applyHttpPipeline } from './common/http-pipeline.js';
import { createPinoLogger } from './common/pino-logger.js';
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

  applyHttpPipeline(app);

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
