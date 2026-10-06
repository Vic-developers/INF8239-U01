/**
 * Database module.
 *
 * Two pools, held separately on purpose:
 *
 *   `db`       the request role. NOBYPASSRLS, no ownership, one tenant per
 *              transaction. Everything a controller does goes through this.
 *   `platform` the single BYPASSRLS role. Three legitimate uses only: tenant
 *              provisioning, login-time identity lookup, cross-tenant jobs.
 *
 * Holding the platform handle in its own provider is what keeps it out of
 * controllers by construction rather than by review. A service that receives
 * only `db` cannot accidentally query across tenants.
 */

import { Global, Inject, Injectable, Module, type OnApplicationShutdown } from '@nestjs/common';
import {
  assertRlsEffective,
  createDatabase,
  createPlatformDatabase,
  type Database,
} from '@mcc/db';
import { config } from '../config/configuration.js';

/**
 * Pool plus its closer. Nest providers are objects here, not bare connections,
 * because `createDatabase` owns both and a pool that is never closed keeps the
 * process alive after a shutdown signal.
 */
export interface DatabasePool {
  readonly db: Database;
  close: () => Promise<void>;
}

export const DATABASE = Symbol('DATABASE');
export const PLATFORM_DATABASE = Symbol('PLATFORM_DATABASE');

@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  constructor(
    @Inject(DATABASE) private readonly pool: DatabasePool,
    @Inject(PLATFORM_DATABASE) private readonly platformPool: DatabasePool,
  ) {}

  /**
   * The request-scoped handle. Injecting `DatabaseService` rather than `db`
   * directly keeps the platform pool out of the constructor signature of every
   * service, so it cannot be reached by accident.
   */
  get db(): Database {
    return this.pool.db;
  }

  /**
   * Verifies at boot that the request role really is restricted.
   *
   * This is the check worth having: if `DATABASE_URL` ever points at a role with
   * BYPASSRLS, every other isolation guarantee in the product becomes
   * decorative, and the failure would otherwise show up as a data breach.
   */
  async verifyIsolation(): Promise<void> {
    await assertRlsEffective(this.pool.db);
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.all([this.pool.close(), this.platformPool.close()]);
  }
}

@Global()
@Module({
  providers: [
    {
      provide: DATABASE,
      useFactory: (): DatabasePool => {
        const { db, close } = createDatabase({
          connectionString: config.DATABASE_URL,
          applicationName: 'mcc-api',
          maxConnections: config.DATABASE_POOL_MAX,
        });
        return { db, close };
      },
    },
    {
      provide: PLATFORM_DATABASE,
      useFactory: (): DatabasePool => {
        const { db, close } = createPlatformDatabase({
          connectionString: config.DATABASE_PLATFORM_URL,
          applicationName: 'mcc-api-platform',
        });
        return { db, close };
      },
    },
    DatabaseService,
  ],
  exports: [DATABASE, PLATFORM_DATABASE, DatabaseService],
})
export class DatabaseModule {}
