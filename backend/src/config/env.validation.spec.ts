import { validateEnv } from './env.validation.js';

const validEnv = {
  PORT: '3001',
  DATABASE_URL: 'postgresql://user:secret@postgres:5432/ai_local',
  CORS_ORIGINS: 'http://127.0.0.1:3000, http://localhost:3000',
  OLLAMA_API_URL: 'http://ollama:11434',
  LLM_BASE_URL: 'http://ollama:11434/v1',
  LLM_DEFAULT_MODEL: 'qwen3.5:2b',
  LLM_CONTEXT_WINDOW: '4096',
  LLM_MAX_OUTPUT_TOKENS: '1024',
  LLM_MAX_OUTPUT_TOKENS_THINKING: '2048',
  LLM_FIRST_TOKEN_TIMEOUT_MS: '120000',
  LLM_TOTAL_TIMEOUT_MS: '300000',
  LLM_QUEUE_MAX_SIZE: '10',
  CONTEXT_MAX_HISTORY_MESSAGES: '20',
};

describe('validateEnv', () => {
  it('parses and converts a valid environment', () => {
    const env = validateEnv(validEnv);

    expect(env.PORT).toBe(3001);
    expect(env.LLM_CONTEXT_WINDOW).toBe(4096);
    expect(env.CORS_ORIGINS).toEqual([
      'http://127.0.0.1:3000',
      'http://localhost:3000',
    ]);
  });

  it('fails when a required variable is missing', () => {
    const { DATABASE_URL: _omitted, ...withoutDb } = validEnv;

    expect(() => validateEnv(withoutDb)).toThrow(/DATABASE_URL/);
  });

  it('fails when a number is not numeric', () => {
    expect(() => validateEnv({ ...validEnv, PORT: 'abc' })).toThrow(/PORT/);
  });
});
