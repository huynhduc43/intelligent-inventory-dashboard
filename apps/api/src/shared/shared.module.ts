import {
  type DynamicModule,
  Global,
  Inject,
  Module,
  type OnApplicationShutdown,
  StandardSchemaValidationPipe,
} from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { Clock, SystemClock } from './clock.js';
import { APP_CONFIG, type AppConfig } from './config.js';
import { createDb, DB, type Db } from './db.js';
import { ProblemDetailsFilter } from './problem-details.filter.js';
import { toValidationErrors, ValidationFailedException } from './problem.js';

@Global()
@Module({})
export class SharedModule implements OnApplicationShutdown {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** `config` is parsed in bootstrap, before Nest starts, so a bad environment never reaches DI. */
  static forRoot(config: AppConfig): DynamicModule {
    const providers = [
      { provide: APP_CONFIG, useValue: config },
      { provide: DB, useFactory: () => createDb(config) },
      { provide: Clock, useClass: SystemClock },
    ];
    return {
      module: SharedModule,
      providers: [
        ...providers,
        { provide: APP_FILTER, useClass: ProblemDetailsFilter },
        {
          // A route opts in by passing a zod schema: `@Body({ schema })`; without one the pipe is a no-op.
          provide: APP_PIPE,
          useValue: new StandardSchemaValidationPipe({
            exceptionFactory: (issues) =>
              new ValidationFailedException(toValidationErrors(issues)),
          }),
        },
      ],
      exports: providers.map((p) => p.provide),
    };
  }

  // Runs after the HTTP server has closed, so no request still needs the pool.
  async onApplicationShutdown(): Promise<void> {
    await this.db.$client.end();
  }
}
