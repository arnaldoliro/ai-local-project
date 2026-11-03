import { Global, Module } from '@nestjs/common';
import { EnvironmentVariables, validateEnv } from './env.validation.js';

/**
 * Exposes the validated environment as an injectable `EnvironmentVariables`.
 *
 * We skip @nestjs/config on purpose: Docker Compose already injects the
 * variables (no .env parsing needed in the app), and validation reuses
 * class-validator, which the DTOs need anyway. One less dependency.
 */
@Global()
@Module({
  providers: [
    {
      provide: EnvironmentVariables,
      useFactory: () => validateEnv(process.env),
    },
  ],
  exports: [EnvironmentVariables],
})
export class ConfigModule {}
