import { Injectable } from '@nestjs/common';
import { EnvironmentVariables } from '../../config/env.validation.js';
import { LlmClient } from '../llm-client.js';
import { LlmError } from '../llm.errors.js';
import type { ChatChunk, ChatRequest } from '../llm.types.js';
import { readLines } from './read-lines.js';

/** Shape of each NDJSON line streamed by POST /api/chat. */
interface OllamaChatLine {
  message?: { content?: string; thinking?: string };
  done?: boolean;
  done_reason?: string;
  prompt_eval_count?: number;
  eval_count?: number;
  load_duration?: number;
  total_duration?: number;
  error?: string;
}

const nsToMs = (ns?: number) =>
  ns === undefined ? null : Math.round(ns / 1e6);

/**
 * Ollama adapter over its native API.
 *
 * Why not the OpenAI-compatible /v1 endpoint: tested on 2026-11-03, it ignores
 * `think: false` (the model spent the whole budget reasoning and returned an
 * empty answer). The native /api/chat honours it.
 *
 * `num_ctx` is intentionally never sent: the window is fixed server-side by
 * OLLAMA_CONTEXT_LENGTH, so no request can grow it.
 */
@Injectable()
export class OllamaClient extends LlmClient {
  constructor(private readonly env: EnvironmentVariables) {
    super();
  }

  async *streamChat(
    request: ChatRequest,
    signal: AbortSignal,
  ): AsyncGenerator<ChatChunk> {
    const response = await this.post('/api/chat', signal, {
      model: request.model,
      messages: request.messages,
      stream: true,
      think: request.think,
      options: {
        num_predict: request.maxOutputTokens,
        ...(request.temperature !== undefined && {
          temperature: request.temperature,
        }),
      },
    });

    for await (const line of readLinesOf(response)) {
      const data = JSON.parse(line) as OllamaChatLine;
      if (data.error) throw new LlmError('model_error', data.error);

      if (data.message?.thinking) {
        yield { type: 'thinking', text: data.message.thinking };
      }
      if (data.message?.content) {
        yield { type: 'content', text: data.message.content };
      }
      if (data.done) {
        yield {
          type: 'done',
          doneReason: data.done_reason ?? 'stop',
          promptTokens: data.prompt_eval_count ?? null,
          completionTokens: data.eval_count ?? null,
          loadDurationMs: nsToMs(data.load_duration),
          totalDurationMs: nsToMs(data.total_duration),
        };
        return;
      }
    }

    throw new LlmError('model_error', 'Stream ended without a final chunk');
  }

  /** GET /api/ps lists models in memory. It never loads anything. */
  async isModelLoaded(model: string): Promise<boolean> {
    const response = await fetch(`${this.env.OLLAMA_API_URL}/api/ps`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return false;
    const { models } = (await response.json()) as {
      models?: { name: string; model: string }[];
    };
    return (models ?? []).some((m) => m.name === model || m.model === model);
  }

  private async post(
    path: string,
    signal: AbortSignal,
    body: unknown,
  ): Promise<Response> {
    let response: Response;
    try {
      response = await fetch(`${this.env.OLLAMA_API_URL}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal,
      });
    } catch (error) {
      if (signal.aborted) throw signal.reason;
      throw new LlmError(
        'unavailable',
        `Ollama unreachable: ${(error as Error).message}`,
      );
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new LlmError(
        response.status === 404 ? 'model_not_found' : 'model_error',
        `Ollama HTTP ${response.status}: ${detail}`,
      );
    }
    return response;
  }
}

function readLinesOf(response: Response) {
  if (!response.body) throw new LlmError('model_error', 'Empty response body');
  return readLines(response.body);
}
