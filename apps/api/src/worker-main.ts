/**
 * Worker entrypoint.
 *
 * The second process of the same NestJS codebase.
 * It builds the identical module graph as the API —
 * same guards, same permission resolution, same job
 * contracts — but creates an application context
 * instead of an HTTP server, and starts the BullMQ
 * worker that executes approved plans.
 *
 * Sharing one module graph is what keeps the process
 * that authorises a request and the process that
 * executes the plan it authorised from drifting
 * apart: they resolve dependencies from the same
 * providers.
 *
 * The executor owns the durable record of a run.
 * It catches its own failures and marks the job
 * failed in the database, so this processor does
 * not throw on a plan-level error; BullMQ only
 * sees a failure when the run itself could not
 * start.
 */

import { writeFileSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { AppModule } from './app.module.js';
import { config } from './config/configuration.js';
import { createPinoLogger } from './common/pino-logger.js';
import { PlanExecutor } from './queue/plan-executor.js';
import type { PlanExecutionMessage } from './queue/producer.js';
import { WRITE_QUEUE } from './queue/queue-name.js';

const logger = createPinoLogger('mcc-worker');

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger,
  });
  const executor = app.get(PlanExecutor);

  // A worker blocks on its queue, so it must not
  // cap in-flight requests the way the producer's
  // connection does.
  const connection = new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: null,
  });

  const worker = new Worker(
    WRITE_QUEUE,
    async (job) => {
      const message = job.data as PlanExecutionMessage;
      logger.log(`Plan ${message.planId} (job ${message.jobId})`);
      await executor.run({
        jobId: message.jobId,
        planId: message.planId,
        scope: {
          tenantId: message.tenantId,
          actorId: message.actorId,
        },
      });
    },
    {
      connection,
      concurrency: config.WORKER_CONCURRENCY,
    },
  );

  worker.on('completed', (job) => {
    logger.log(`Job ${job.id} completado`);
  });
  worker.on('failed', (job, error) => {
    logger.error(`Job ${job?.id ?? '?'} falló: ${error.message}`);
  });

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, async () => {
      logger.log(`Cerrando worker (${signal})`);
      await worker.close();
      await connection.quit();
      await app.close();
      process.exit(0);
    });
  }

  logger.log(
    `Worker escuchando en ${WRITE_QUEUE} (concurrencia ${config.WORKER_CONCURRENCY})`,
  );
}

bootstrap().catch((error: unknown) => {
  // Written synchronously on purpose: a failing
  // async pipe write is truncated by process.exit,
  // which is how startup errors used to vanish.
  writeFileSync(
    'worker-startup-error.log',
    error instanceof Error
      ? (error.stack ?? error.message)
      : String(error),
  );
  process.exit(1);
});
