import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { EnvironmentVariables } from '../config/env.validation.js';
import { LlmClient } from './llm-client.js';
import { LlmError, type LlmErrorCode } from './llm.errors.js';
import { LlmQueue } from './llm-queue.js';
import type {
  ChatChunk,
  ChatRequest,
  ChatResult,
  ModelInfo,
} from './llm.types.js';
import { LlmPriority } from './llm.types.js';

export interface ChatCallOptions {
  priority: LlmPriority;
  /** Caller cancellation (e.g. the browser closed the stream). */
  signal?: AbortSignal;
  onQueued?: (position: number) => void;
  /** Fired once the call leaves the queue and is about to hit the model. */
  onStart?: (info: { modelLoaded: boolean }) => void;
  onChunk?: (chunk: Exclude<ChatChunk, { type: 'done' }>) => void;
}

/**
 * The only entry point for model calls in the whole app.
 *
 * Every call: waits in the queue (one at a time), then runs with two
 * timeouts (first chunk and total) and is aborted on caller cancellation,
 * on timeout or on shutdown. Aborting the HTTP request makes Ollama stop
 * generating, which frees the GPU immediately.
 */
const MODELS_CACHE_MS = 10_000;

@Injectable()
export class LlmService implements OnModuleDestroy {
  private readonly logger = new Logger(LlmService.name);
  private readonly queue: LlmQueue;
  private readonly shutdown = new AbortController();
  /** The call currently on the model, so a chat can preempt background work. */
  private running: { priority: LlmPriority; preempt: () => void } | null = null;
  private modelsCache: { models: ModelInfo[]; expiresAt: number } | null = null;

  constructor(
    private readonly client: LlmClient,
    private readonly env: EnvironmentVariables,
  ) {
    this.queue = new LlmQueue(env.LLM_QUEUE_MAX_SIZE);
  }

  /**
   * Installed models. Cached for a few seconds: every chat message checks
   * its model's capabilities, and that shouldn't mean an HTTP call each time.
   * Listing never loads a model, so it doesn't go through the queue.
   */
  async listModels(): Promise<ModelInfo[]> {
    const now = Date.now();
    if (this.modelsCache && this.modelsCache.expiresAt > now) {
      return this.modelsCache.models;
    }
    const models = await this.client.listModels();
    this.modelsCache = { models, expiresAt: now + MODELS_CACHE_MS };
    return models;
  }

  /** null when the model isn't installed (or Ollama is unreachable). */
  async findModel(name: string): Promise<ModelInfo | null> {
    const models = await this.listModels().catch(() => []);
    return models.find((m) => m.name === name) ?? null;
  }

  /** Lets callers reject early (HTTP 503) instead of persisting doomed work. */
  hasCapacity(): boolean {
    return this.queue.hasCapacity();
  }

  chat(request: ChatRequest, options: ChatCallOptions): Promise<ChatResult> {
    // A user waiting for an answer beats a title or a summary: interrupt the
    // background call instead of queueing behind it. It is retried after the
    // next exchange, so nothing is lost.
    if (
      options.priority === LlmPriority.Chat &&
      this.running &&
      this.running.priority !== LlmPriority.Chat
    ) {
      this.running.preempt();
    }

    return this.queue.run(() => this.execute(request, options), {
      priority: options.priority,
      signal: options.signal,
      onPosition: options.onQueued,
    });
  }

  /** Non-streaming convenience for background work: returns the whole text. */
  async complete(
    request: ChatRequest,
    options: Omit<ChatCallOptions, 'onChunk'>,
  ): Promise<{ content: string; result: ChatResult }> {
    let content = '';
    const result = await this.chat(request, {
      ...options,
      onChunk: (chunk) => {
        if (chunk.type === 'content') content += chunk.text;
      },
    });
    return { content, result };
  }

  onModuleDestroy(): void {
    this.shutdown.abort(new LlmError('aborted', 'Server shutting down'));
  }

  private async execute(
    request: ChatRequest,
    options: ChatCallOptions,
  ): Promise<ChatResult> {
    const controller = new AbortController();
    const abort = (code: LlmErrorCode, message: string) => {
      if (!controller.signal.aborted) {
        controller.abort(new LlmError(code, message));
      }
    };

    const firstChunkTimer = setTimeout(
      () => abort('timeout_first_token', 'No response from the model in time'),
      this.env.LLM_FIRST_TOKEN_TIMEOUT_MS,
    );
    const totalTimer = setTimeout(
      () => abort('timeout_total', 'Model call exceeded the total timeout'),
      this.env.LLM_TOTAL_TIMEOUT_MS,
    );
    const onCallerAbort = () => abort('aborted', 'Cancelled by the client');
    const onShutdown = () => abort('aborted', 'Server shutting down');
    options.signal?.addEventListener('abort', onCallerAbort, { once: true });
    this.shutdown.signal.addEventListener('abort', onShutdown, { once: true });
    if (options.signal?.aborted) onCallerAbort();
    this.running = {
      priority: options.priority,
      preempt: () => abort('preempted', 'Interrupted by a chat request'),
    };

    try {
      const modelLoaded = await this.client
        .isModelLoaded(request.model)
        .catch(() => true);
      options.onStart?.({ modelLoaded });

      for await (const chunk of this.client.streamChat(
        request,
        controller.signal,
      )) {
        clearTimeout(firstChunkTimer);
        if (chunk.type === 'done') {
          const { type: _type, ...result } = chunk;
          return result;
        }
        options.onChunk?.(chunk);
        // Don't rely on the provider honouring the signal: stop consuming.
        if (controller.signal.aborted) throw controller.signal.reason;
      }
      throw new LlmError('model_error', 'Stream ended without a final chunk');
    } catch (error) {
      // Our own aborts carry an LlmError as the reason; prefer it over the
      // generic AbortError that fetch throws.
      if (controller.signal.aborted) throw controller.signal.reason as LlmError;
      if (error instanceof LlmError) throw error;
      this.logger.error(error);
      throw new LlmError('unavailable', (error as Error).message);
    } finally {
      this.running = null;
      clearTimeout(firstChunkTimer);
      clearTimeout(totalTimer);
      options.signal?.removeEventListener('abort', onCallerAbort);
      this.shutdown.signal.removeEventListener('abort', onShutdown);
    }
  }
}
