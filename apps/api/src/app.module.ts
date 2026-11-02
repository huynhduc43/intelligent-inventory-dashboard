import { type DynamicModule, Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
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
          pinoHttp: [pinoHttpOptions(config), logDestination ?? process.stdout],
        }),
        HealthModule,
      ],
    };
  }
}
