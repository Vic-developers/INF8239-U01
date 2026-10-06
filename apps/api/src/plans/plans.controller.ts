/**
 * Plan routes.
 *
 * The plan lifecycle is the product's write path, so
 * each step is gated: creating needs `plans.create`,
 * and the steps that drive execution — approve and
 * cancel — need `plans.execute`. Previewing and
 * reading need only `plans.read`, because a preview
 * is a dry run that writes nothing to Moodle.
 *
 * Approval takes an explicit `confirmPreview: true`
 * in the body. That is the confirmation the product
 * requires before a destructive operation runs: the
 * caller proves they saw the impact, not just that
 * they know the route.
 */

import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import {
  operationPlanSchema,
  type OperationPlanInput,
} from '@mcc/shared';
import { approvePlanSchema, PlansService } from './plans.service.js';
import { scopeOf } from '../moodle/moodle.service.js';
import { CurrentContext, type RequestContext } from '../common/request-context.js';
import { zodPipe } from '../common/zod-validation.pipe.js';
import { RequirePermissions } from '../auth/route-metadata.js';

@Controller('plans')
@RequirePermissions('plans.read')
export class PlansController {
  constructor(private readonly plans: PlansService) {}

  @Post()
  @HttpCode(201)
  @RequirePermissions('plans.create')
  async create(
    @Body(zodPipe(operationPlanSchema)) body: OperationPlanInput,
    @CurrentContext() context: RequestContext,
  ) {
    return this.plans.create(body, scopeOf(context));
  }

  @Get()
  async list(@CurrentContext() context: RequestContext) {
    return this.plans.list(scopeOf(context));
  }

  @Get(':id')
  async get(
    @Param('id') id: string,
    @CurrentContext() context: RequestContext,
  ) {
    return this.plans.get(id, scopeOf(context));
  }

  /**
   * Dry run. Classifies every item against the
   * live instance and reports the impact, but
   * writes nothing to Moodle.
   */
  @Post(':id/preview')
  @HttpCode(200)
  async preview(
    @Param('id') id: string,
    @CurrentContext() context: RequestContext,
  ) {
    return this.plans.preview(id, scopeOf(context));
  }

  /**
   * The explicit confirmation. Requires the
   * operator to assert they reviewed the preview.
   */
  @Post(':id/approve')
  @HttpCode(201)
  @RequirePermissions('plans.execute')
  async approve(
    @Param('id') id: string,
    @Body(zodPipe(approvePlanSchema)) _body: { confirmPreview: boolean },
    @CurrentContext() context: RequestContext,
  ) {
    return this.plans.approve(id, scopeOf(context));
  }

  @Post(':id/cancel')
  @HttpCode(204)
  @RequirePermissions('plans.execute')
  async cancel(
    @Param('id') id: string,
    @CurrentContext() context: RequestContext,
  ): Promise<void> {
    await this.plans.cancel(id, scopeOf(context));
  }
}
