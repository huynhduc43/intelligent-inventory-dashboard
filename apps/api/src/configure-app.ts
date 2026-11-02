import type { INestApplication } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { pinoHttp } from 'pino-http';
import type { AppConfig } from './shared/config.js';
import { pinoHttpOptions } from './shared/logging.js';

/** Shared by `main.ts` and the integration tests. The logger is mounted here so it runs before Nest's body parser (ADR 0006). */
export function configureApp(
  app: INestApplication,
  config: AppConfig,
  logDestination?: NodeJS.WritableStream,
): void {
  app.use(pinoHttp(pinoHttpOptions(config), logDestination));
  app.useLogger(app.get(Logger));
}
