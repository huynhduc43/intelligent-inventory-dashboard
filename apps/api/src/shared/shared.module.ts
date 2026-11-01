import {
  type DynamicModule,
  Global,
  Inject,
  Module,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { Clock, SystemClock } from './clock.js';
import { APP_CONFIG, type AppConfig } from './config.js';
import { createDb, DB, type Db } from './db.js';

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
      providers,
      exports: providers.map((p) => p.provide),
    };
  }

  // Runs after the HTTP server has closed, so no request still needs the pool.
  async onApplicationShutdown(): Promise<void> {
    await this.db.$client.end();
  }
}
