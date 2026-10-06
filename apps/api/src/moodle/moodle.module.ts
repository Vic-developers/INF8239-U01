/**
 * Moodle module.
 *
 * `DatabaseService` is global, so only the crypto module has to
 * be imported here: the service needs it to seal and open the
 * web-service token. The service is exported for the plan
 * executor, which opens adapters through it.
 */

import { Module } from '@nestjs/common';
import { CryptoModule } from '../crypto/crypto.module.js';
import { RedisModule } from '../redis/redis.module.js';
import { MoodleController } from './moodle.controller.js';
import { MoodleService } from './moodle.service.js';

@Module({
  imports: [CryptoModule, RedisModule],
  controllers: [MoodleController],
  providers: [MoodleService],
  exports: [MoodleService],
})
export class MoodleModule {}
