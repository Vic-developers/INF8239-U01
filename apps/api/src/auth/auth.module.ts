/**
 * Auth module.
 *
 * Two guards, in a fixed order, applied globally:
 *
 *   1. `SessionGuard`     — who is this, and which tenant
 *   2. `PermissionsGuard` — may they do this
 *
 * They are registered as `APP_GUARD` so a new controller cannot forget one. A
 * per-route `@UseGuards` is exactly the kind of omission that ships a route
 * reachable by anyone, and forgetting it is invisible in review.
 *
 * The login routes are excluded by `@Public()` rather than by overriding guards
 * per controller, so the exemption is a deliberate, greppable annotation.
 */

import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { TokenService } from './token.service.js';
import { SessionGuard } from './session.guard.js';
import { PermissionsGuard } from './permissions.guard.js';
import { CryptoModule } from '../crypto/crypto.module.js';

@Module({
  imports: [CryptoModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    // Order matters and is guaranteed by the provider array: a request must be
    // identified before its permissions can be checked.
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
  exports: [AuthService, TokenService],
})
export class AuthModule {}
