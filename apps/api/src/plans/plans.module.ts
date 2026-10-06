/**
 * Plans module.
 *
 * The plan engine depends on the Moodle module to
 * open adapters for previewing, and on the queue
 * module to hand approved plans to the worker. Both
 * are imported here so the engine, the adapter and
 * the queue stay wired together in one place.
 */

import { Module } from '@nestjs/common';
import { MoodleModule } from '../moodle/moodle.module.js';
import { QueueModule } from '../queue/queue.module.js';
import { PlansController } from './plans.controller.js';
import { PlansService } from './plans.service.js';

@Module({
  imports: [MoodleModule, QueueModule],
  controllers: [PlansController],
  providers: [PlansService],
})
export class PlansModule {}
