import { Injectable } from '@nestjs/common';
import { EnvironmentVariables } from '../../config/env.validation.js';
import { EmbeddingClient } from '../embedding-client.js';
import { LlmError } from '../llm.errors.js';

/** POST /api/embed on the CPU-only instance (`ollama-embed` in compose). */
@Injectable()
export class OllamaEmbeddingClient extends EmbeddingClient {
  constructor(private readonly env: EnvironmentVariables) {
    super();
  }

  async embed(
    model: string,
    inputs: string[],
    signal: AbortSignal,
  ): Promise<number[][]> {
    let response: Response;
    try {
      response = await fetch(`${this.env.EMBEDDING_API_URL}/api/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // truncate: an over-long input is cut instead of failing the call.
        body: JSON.stringify({ model, input: inputs, truncate: true }),
        signal,
      });
    } catch (error) {
      if (signal.aborted) throw signal.reason;
      throw new LlmError(
        'unavailable',
        `Embedding server unreachable: ${(error as Error).message}`,
      );
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new LlmError(
        response.status === 404 ? 'model_not_found' : 'model_error',
        `Embedding HTTP ${response.status}: ${detail}`,
      );
    }
    const { embeddings } = (await response.json()) as {
      embeddings?: number[][];
    };
    if (!embeddings || embeddings.length !== inputs.length) {
      throw new LlmError('model_error', 'Unexpected embedding response');
    }
    return embeddings;
  }

  async hasModel(model: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.env.EMBEDDING_API_URL}/api/tags`, {
        signal: AbortSignal.timeout(3000),
      });
      if (!response.ok) return false;
      const { models } = (await response.json()) as {
        models?: { name: string }[];
      };
      return (models ?? []).some((m) => m.name === model);
    } catch {
      return false;
    }
  }
}
