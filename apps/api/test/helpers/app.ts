/**
 * In-process test application.
 *
 * Creates the real module graph — the same one the API
 * and the worker run — so a test exercises the actual
 * guards, services and validation pipes rather than a
 * parallel copy of them. The HTTP server is driven
 * through supertest on an ephemeral port.
 *
 * The test suite runs against its own Redis database
 * (see `test/setup-env.ts`), so an in-process worker
 * never competes with a dev worker for a job.
 */

import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import supertest from 'supertest';
import { AppModule } from '../../src/app.module.js';
import { createPinoLogger } from '../../src/common/pino-logger.js';
import { applyHttpPipeline } from '../../src/common/http-pipeline.js';
import { config } from '../../src/config/configuration.js';
import { DatabaseService } from '../../src/database/database.module.js';
import { PlanExecutor } from '../../src/queue/plan-executor.js';
import type { PlanExecutionMessage } from '../../src/queue/producer.js';
import { WRITE_QUEUE } from '../../src/queue/queue-name.js';

export interface TestApp {
  readonly app: INestApplication;
  /** Cookie-persisting client, for login -> session -> refresh flows. */
  readonly agent: ReturnType<typeof supertest.agent>;
  /** Stateless client, for requests that send a bearer token. */
  readonly request: ReturnType<typeof supertest>;
  readonly close: () => Promise<void>;
}

export async function createTestApp(): Promise<TestApp> {
  const logger = createPinoLogger('mcc-test');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger,
  });
  // The same middleware stack as `main.ts`. Without it the harness would be
  // testing an app that differs from the one that ships — cookie auth in
  // particular depends on `cookieParser` having run.
  applyHttpPipeline(app);
  await app.init();
  // Same startup guard as production: a database whose request role can
  // bypass RLS would make every isolation test in this suite meaningless.
  await app.get(DatabaseService).verifyIsolation();

  const server = app.getHttpServer();
  return {
    app,
    agent: supertest.agent(server),
    request: supertest(server),
    close: () => app.close(),
  };
}

export interface TestWorker {
  readonly close: () => Promise<void>;
}

/**
 * The worker side of the queue, in-process. The test
 * enqueues through the same producer the API uses and
 * this picks the job up, so the queue round-trip —
 * not just the executor — is exercised without a
 * second process.
 */
export async function createTestWorker(
  app: INestApplication,
): Promise<TestWorker> {
  const executor = app.get(PlanExecutor);
  // A worker blocks on its queue, so it must not cap
  // in-flight requests the way the producer's connection does.
  const connection = new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: null,
  });

  const worker = new Worker(
    WRITE_QUEUE,
    async (job) => {
      const message = job.data as PlanExecutionMessage;
      await executor.run({
        jobId: message.jobId,
        planId: message.planId,
        scope: {
          tenantId: message.tenantId,
          actorId: message.actorId,
        },
      });
    },
    { connection, concurrency: 1 },
  );

  return {
    close: async () => {
      await worker.close();
      await connection.quit();
    },
  };
}

/**
 * Removes the mock Moodle's simulated state, so a test
 * starts from an empty set of instances regardless of
 * what an earlier run left behind.
 */
export async function clearMockState(): Promise<void> {
  const redis = new Redis(config.REDIS_URL);
  try {
    let cursor = '0';
    do {
      const [next, keys] = await redis.scan(
        cursor,
        'MATCH',
        'mcc:mock:*',
        'COUNT',
        100,
      );
      cursor = next;
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } while (cursor !== '0');
  } finally {
    await redis.quit();
  }
}
