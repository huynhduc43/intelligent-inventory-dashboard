import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { configureApp } from './configure-app.js';
import { setupDocs } from './shared/docs.js';
import { type AppConfig, ConfigError, loadConfig } from './shared/config.js';

function configOrExit(): AppConfig {
  try {
    return loadConfig(process.env);
  } catch (e) {
    if (!(e instanceof ConfigError)) throw e;
    // Logger is not up yet (it needs LOG_LEVEL), so write straight to stderr.
    process.stderr.write(`${e.message}\n`);
    process.exit(1);
  }
}

async function bootstrap() {
  const config = configOrExit();
  const app = await NestFactory.create(AppModule.forRoot(config), {
    bufferLogs: true,
  });
  configureApp(app, config);
  const docs = config.NODE_ENV !== 'production';
  if (docs) setupDocs(app);
  app.enableShutdownHooks();
  await app.listen(config.PORT);
  const log = app.get(Logger);
  log.log(`API listening on port ${String(config.PORT)}`);
  if (docs) {
    log.log(`Swagger UI: http://localhost:${String(config.PORT)}/docs`);
  }
}
await bootstrap();
