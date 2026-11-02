import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp } from './configure-app.js';
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
  app.enableShutdownHooks();
  await app.listen(config.PORT);
}
await bootstrap();
