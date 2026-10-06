/**
 * Redis module.
 *
 * Provides the shared connection so the Moodle
 * module (whose mock adapter persists its
 * simulated state in Redis) and the queue module
 * (whose producer enqueues to Redis) share one
 * client per process instead of opening a
 * connection each.
 */

import { Module } from '@nestjs/common';
import { RedisService } from './redis.service.js';

@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
