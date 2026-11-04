import type { ChatChunk, ChatRequest, ModelInfo } from './llm.types.js';

/**
 * Provider-agnostic contract. The rest of the app never knows it is talking
 * to Ollama: switching providers means writing another implementation.
 *
 * It is an abstract class (not an interface) so it can be used as a Nest
 * injection token. It is NOT exported by LlmModule: everything outside the
 * module goes through LlmService, which owns the queue.
 */
export abstract class LlmClient {
  /** Streams one chat completion. Must stop the generation when `signal` aborts. */
  abstract streamChat(
    request: ChatRequest,
    signal: AbortSignal,
  ): AsyncIterable<ChatChunk>;

  /** Whether the model is already in memory (a call will not pay the load time). */
  abstract isModelLoaded(model: string): Promise<boolean>;

  /** Installed models with their capabilities. Must not load any model. */
  abstract listModels(): Promise<ModelInfo[]>;
}
