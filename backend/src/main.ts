import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { EnvironmentVariables } from './config/env.validation.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const env = app.get(EnvironmentVariables);

  // Only the frontend origin may call the API from a browser.
  app.enableCors({ origin: env.CORS_ORIGINS });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  // Closes the Prisma pool (and later, aborts in-flight model calls) on stop.
  app.enableShutdownHooks();

  // 0.0.0.0 inside the container only; the host publishes it on 127.0.0.1.
  await app.listen(env.PORT, '0.0.0.0');
  Logger.log(`API listening on port ${env.PORT}`, 'Bootstrap');
}
await bootstrap();
