import { Controller, Get } from '@nestjs/common';
import { EnvironmentVariables } from '../config/env.validation.js';
import { PrismaService } from '../prisma/prisma.service.js';

type DependencyStatus = { ok: boolean; detail?: string };

/**
 * Checks that the backend can reach its dependencies.
 *
 * The Ollama check hits `/api/version`, which never loads a model, so polling
 * this endpoint costs nothing on the GPU.
 */
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly env: EnvironmentVariables,
  ) {}

  @Get()
  async check() {
    const [database, ollama] = [
      await this.checkDatabase(),
      await this.checkOllama(),
    ];

    return {
      status: database.ok && ollama.ok ? 'ok' : 'degraded',
      database,
      ollama,
      contextWindow: this.env.LLM_CONTEXT_WINDOW,
      defaultModel: this.env.LLM_DEFAULT_MODEL,
    };
  }

  private async checkDatabase(): Promise<DependencyStatus> {
    try {
      const [row] = await this.prisma.$queryRaw<{ version: string }[]>`
        SELECT extversion AS version FROM pg_extension WHERE extname = 'vector'
      `;
      return row
        ? { ok: true, detail: `pgvector ${row.version}` }
        : { ok: false, detail: 'pgvector extension not installed' };
    } catch (error) {
      return { ok: false, detail: (error as Error).message };
    }
  }

  private async checkOllama(): Promise<DependencyStatus> {
    try {
      const response = await fetch(`${this.env.OLLAMA_API_URL}/api/version`, {
        signal: AbortSignal.timeout(3000),
      });
      if (!response.ok) return { ok: false, detail: `HTTP ${response.status}` };
      const { version } = (await response.json()) as { version: string };
      return { ok: true, detail: `ollama ${version}` };
    } catch (error) {
      return { ok: false, detail: (error as Error).message };
    }
  }
}
