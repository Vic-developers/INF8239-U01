/**
 * Queue module.
 *
 * Owns the producer the API uses to enqueue work
 * and the executor the worker uses to run it. Both
 * sit in one module so the message the producer
 * writes and the processor reads cannot drift.
 *
 * The `Worker` itself is not started here: it
 * belongs to the worker process, which builds the
 * same module graph from `worker-main.ts`.
 */

import { Module } from '@nestjs/common';
import { MoodleModule } from '../moodle/moodle.module.js';
import { RedisModule } from '../redis/redis.module.js';
import { PlanExecutor } from './plan-executor.js';
import { QueueProducer } from './producer.js';

@Module({
  imports: [MoodleModule, RedisModule],
  providers: [PlanExecutor, QueueProducer],
  exports: [PlanExecutor, QueueProducer],
})
export class QueueModule {}
