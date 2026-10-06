/**
 * Moodle instance routes.
 *
 * Instance management is tenant-scoped and permission-gated:
 * listing and probing need `moodles.read`, registering needs
 * `moodles.create`, and deregistering needs `moodles.delete`.
 * The web-service token is accepted on create but never
 * returned by any route — only its last four characters are
 * stored, purely so an operator can tell two tokens apart.
 *
 * The service takes a `TenantScope`, not the request context,
 * so the worker can drive the same methods without an HTTP
 * request in scope.
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import {
  createInstanceSchema,
  MoodleService,
  scopeOf,
} from './moodle.service.js';
import { CurrentContext, type RequestContext } from '../common/request-context.js';
import { zodPipe } from '../common/zod-validation.pipe.js';
import { RequirePermissions } from '../auth/route-metadata.js';

@Controller('moodles')
@RequirePermissions('moodles.read')
export class MoodleController {
  constructor(private readonly moodles: MoodleService) {}

  @Post()
  @HttpCode(201)
  @RequirePermissions('moodles.create')
  async create(
    @Body(zodPipe(createInstanceSchema)) body: Parameters<MoodleService['create']>[0],
    @CurrentContext() context: RequestContext,
  ) {
    return this.moodles.create(body, scopeOf(context));
  }

  @Get()
  async list(@CurrentContext() context: RequestContext) {
    return this.moodles.list(scopeOf(context));
  }

  @Get(':id')
  async get(
    @Param('id') id: string,
    @CurrentContext() context: RequestContext,
  ) {
    return this.moodles.get(id, scopeOf(context));
  }

  /**
   * Probes the instance and refreshes its discovered version,
   * plugin status and capability set.
   */
  @Post(':id/probe')
  @HttpCode(200)
  @RequirePermissions('moodles.execute')
  async probe(
    @Param('id') id: string,
    @CurrentContext() context: RequestContext,
  ) {
    return this.moodles.probe(id, scopeOf(context));
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('moodles.delete')
  async remove(
    @Param('id') id: string,
    @CurrentContext() context: RequestContext,
  ): Promise<void> {
    await this.moodles.remove(id, scopeOf(context));
  }
}
