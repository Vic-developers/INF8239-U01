/**
 * Health endpoint.
 *
 * A liveness probe: it answers only when the process is
 * up and routing, which is what a container orchestrator
 * and a test suite's readiness check need. It deliberately
 * does not touch the database or Redis — a dependency check
 * belongs in a readiness probe, and conflating the two is
 * how a healthy process gets restarted because a slow query
 * was treated as a crash.
 */

import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/route-metadata.js';

@Controller('health')
export class HealthController {
  /**
   * Public on purpose: an orchestrator's liveness probe has no
   * credentials, and a health check that answers 401 reads as a
   * healthy process being killed for failing auth.
   */
  @Get()
  @Public()
  check(): { status: 'ok'; timestamp: string } {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
