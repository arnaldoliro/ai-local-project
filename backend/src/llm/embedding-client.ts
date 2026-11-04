/**
 * Turns texts into vectors. Separate from LlmClient because it talks to a
 * different server (the CPU-only Ollama), but it is equally internal to
 * LlmModule: callers go through LlmService, i.e. through the queue.
 */
export abstract class EmbeddingClient {
  /** One vector per input, in order. Must stop when `signal` aborts. */
  abstract embed(
    model: string,
    inputs: string[],
    signal: AbortSignal,
  ): Promise<number[][]>;

  /** Whether the server is up and has the model. Must not load it. */
  abstract hasModel(model: string): Promise<boolean>;
}
