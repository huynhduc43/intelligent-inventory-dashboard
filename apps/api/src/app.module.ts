import { type DynamicModule, Module } from '@nestjs/common';
import { HealthModule } from './modules/health/health.module.js';
import type { AppConfig } from './shared/config.js';
import { SharedModule } from './shared/shared.module.js';

@Module({})
export class AppModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [SharedModule.forRoot(config), HealthModule],
    };
  }
}
