/**
 * Health module.
 *
 * Stateless, so it is the one module with no providers and
 * no imports: a liveness check should not depend on anything
 * that could itself be down.
 */

import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';

@Module({ controllers: [HealthController] })
export class HealthModule {}
