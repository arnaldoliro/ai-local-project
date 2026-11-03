import { plainToInstance, Transform } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsString,
  IsUrl,
  Max,
  Min,
  validateSync,
} from 'class-validator';

/**
 * Every environment variable the backend reads, validated once at startup.
 * If anything is missing or malformed the process exits before listening,
 * so misconfiguration never shows up later as a confusing runtime error.
 */
export class EnvironmentVariables {
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number;

  @IsUrl({ protocols: ['postgresql', 'postgres'], require_tld: false })
  DATABASE_URL: string;

  /** Comma-separated list of origins allowed by CORS (the frontend). */
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value
          .split(',')
          .map((origin) => origin.trim())
          .filter(Boolean)
      : value,
  )
  @IsArray()
  @ArrayNotEmpty()
  @IsUrl({ require_tld: false }, { each: true })
  CORS_ORIGINS: string[];

  /** Native Ollama API (health check, model listing). */
  @IsUrl({ require_tld: false })
  OLLAMA_API_URL: string;

  /** OpenAI-compatible endpoint used for chat and embeddings. */
  @IsUrl({ require_tld: false })
  LLM_BASE_URL: string;

  @IsString()
  LLM_DEFAULT_MODEL: string;

  /**
   * Context window in tokens. Must match OLLAMA_CONTEXT_LENGTH on the Ollama
   * container (both come from the same .env value in docker-compose.yml).
   */
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(512)
  LLM_CONTEXT_WINDOW: number;
}

export function validateEnv(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const env = plainToInstance(EnvironmentVariables, config, {
    excludeExtraneousValues: false,
  });
  const errors = validateSync(env, {
    skipMissingProperties: false,
    whitelist: true,
  });

  if (errors.length > 0) {
    const details = errors
      .map(
        (error) =>
          `  - ${error.property}: ${Object.values(error.constraints ?? {}).join(', ')}`,
      )
      .join('\n');
    throw new Error(`Invalid environment variables:\n${details}`);
  }

  return env;
}
