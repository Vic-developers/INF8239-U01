/**
 * Queue producer.
 *
 * The HTTP side of the queue: it hands work to
 * BullMQ and returns. It never executes anything
 * — execution belongs to the worker process,
 * which is a separate entrypoint (`worker-main.ts`)
 * so a long-running plan cannot hold an HTTP
 * request open.
 *
 * The Redis connection is shared, provided by
 * `RedisService`, rather than opened here: one
 * connection per process, reused by the mock
 * adapter's state and every queue this producer
 * writes to. `RedisService` owns closing it on
 * shutdown, so this class only closes the BullMQ
 * queue wrappers it created.
 */

import { Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { Queue } from 'bullmq';
import type { QueueName } from '@mcc/shared';
import { RedisService } from '../redis/redis.service.js';
import { WRITE_QUEUE } from './queue-name.js';

export interface PlanExecutionMessage {
  readonly jobId: string;
  readonly planId: string;
  readonly tenantId: string;
  readonly actorId: string;
}

@Injectable()
export class QueueProducer implements OnApplicationShutdown {
  private readonly queues = new Map<QueueName, Queue>();

  constructor(private readonly redis: RedisService) {}

  /**
   * Enqueues a plan for execution. The BullMQ job id
   * is derived from the plan id, so re-approving the
   * same plan replaces its queued job rather than
   * stacking a second one behind it.
   */
  async enqueuePlanExecution(
    message: PlanExecutionMessage,
    priority: number,
  ): Promise<string> {
    const queue = this.queueFor(WRITE_QUEUE);
    const bullJob = await queue.add(
      'plan.execute',
      message,
      {
        jobId: `plan-${message.planId}`,
        priority,
        attempts: 1,
      },
    );
    return bullJob.id ?? message.jobId;
  }

  private queueFor(name: QueueName): Queue {
    let queue = this.queues.get(name);
    if (!queue) {
      queue = new Queue(name, {
        connection: this.redis.getClient(),
      });
      this.queues.set(name, queue);
    }
    return queue;
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.all(
      [...this.queues.values()].map((queue) => queue.close()),
    );
  }
}
