/**
 * Shared Redis connection.
 *
 * One connection per process. The API and the
 * worker each hold their own, but both reach
 * the same server, so state written by either —
 * the mock Moodle's simulated resources, queued
 * jobs — is visible to both. That is what lets
 * a plan executed by the worker be idempotent
 * when previewed again through the API.
 *
 * A separate blocking connection is owned by
 * BullMQ's worker, which requires
 * `maxRetriesPerRequest: null`; this connection
 * is for everything else.
 */

import { Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { Redis } from 'ioredis';
import { config } from '../config/configuration.js';

@Injectable()
export class RedisService implements OnApplicationShutdown {
  private client: Redis | null = null;

  getClient(): Redis {
    if (!this.client) {
      this.client = new Redis(config.REDIS_URL, {
        lazyConnect: true,
        maxRetriesPerRequest: 3,
      });
    }
    return this.client;
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
    }
  }
}
