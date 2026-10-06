/**
 * Root module.
 *
 * Assembled so that the HTTP surface and the worker share one dependency graph:
 * guards, permission resolution and job contracts cannot drift between the process
 * that authorises a request and the process that executes the plan it authorised.
 * `worker-main.ts` builds a context from this same module with HTTP stripped.
 */

import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { DatabaseModule } from './database/database.module.js';
import { AuthModule } from './auth/auth.module.js';
import { AppExceptionFilter } from './common/app-exception.filter.js';

@Module({
  imports: [DatabaseModule, AuthModule],
  providers: [{ provide: APP_FILTER, useClass: AppExceptionFilter }],
})
export class AppModule {}
