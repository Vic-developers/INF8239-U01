/**
 * Crypto module.
 *
 * Owns the master-key token and the service that uses it. The key is
 * provided as a value here rather than read from the environment
 * inside the service, which is what makes the service injectable:
 * a primitive constructor parameter has no provider, and Nest would
 * refuse to start the application over it.
 */

import { Module } from '@nestjs/common';
import { config } from '../config/configuration.js';
import { CryptoService, MASTER_KEY } from './crypto.service.js';

@Module({
  providers: [
    { provide: MASTER_KEY, useValue: config.MCC_MASTER_KEY },
    CryptoService,
  ],
  exports: [CryptoService],
})
export class CryptoModule {}
