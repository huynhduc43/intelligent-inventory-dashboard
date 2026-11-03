import { type DynamicModule, Module } from '@nestjs/common';
import { RouterModule } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { ActionsModule } from './modules/actions/actions.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { DealershipsModule } from './modules/dealerships/dealerships.module.js';
import { DashboardModule } from './modules/dashboard/dashboard.module.js';
import { InventoryModule } from './modules/inventory/inventory.module.js';
import { HealthModule } from './modules/health/health.module.js';
import type { AppConfig } from './shared/config.js';
import { pinoHttpOptions } from './shared/logging.js';
import { SharedModule } from './shared/shared.module.js';

@Module({})
export class AppModule {
  static forRoot(
    config: AppConfig,
    logDestination?: NodeJS.WritableStream,
  ): DynamicModule {
    return {
      module: AppModule,
      imports: [
        SharedModule.forRoot(config),
        // The request middleware is mounted by configureApp (ADR 0006); this only binds req.log to the request context.
        LoggerModule.forRoot({
          useExisting: true,
          pinoHttp: logDestination
            ? [pinoHttpOptions(config), logDestination]
            : pinoHttpOptions(config),
        }),
        // Dealership modules register here too (later issues), so unmatched paths still reach Nest's 404 handler.
        RouterModule.register([
          { path: 'api/v1', module: AuthModule },
          { path: 'api/v1', module: InventoryModule },
          { path: 'api/v1', module: DashboardModule },
          { path: 'api/v1', module: ActionsModule },
          { path: 'api/v1', module: DealershipsModule },
        ]),
        AuthModule,
        InventoryModule,
        DashboardModule,
        ActionsModule,
        DealershipsModule,
        HealthModule,
      ],
    };
  }
}
