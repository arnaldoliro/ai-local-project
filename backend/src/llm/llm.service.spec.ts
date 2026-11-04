import type { EnvironmentVariables } from '../config/env.validation.js';
import type { EmbeddingClient } from './embedding-client.js';
import { LlmClient } from './llm-client.js';
import { LlmService } from './llm.service.js';
import type { ChatChunk, ChatRequest } from './llm.types.js';
import { LlmPriority } from './llm.types.js';

const baseEnv = {
  LLM_QUEUE_MAX_SIZE: 10,
  LLM_FIRST_TOKEN_TIMEOUT_MS: 50,
  LLM_TOTAL_TIMEOUT_MS: 200,
};
const env = baseEnv as EnvironmentVariables;

const request: ChatRequest = {
  model: 'fake',
  messages: [{ role: 'user', content: 'hi' }],
  think: false,
  maxOutputTokens: 16,
};

/** Never used by chat tests; embedding tests pass their own. */
const noEmbedder = {
  embed: () => Promise.reject(new Error('not used')),
  hasModel: () => Promise.resolve(false),
} as unknown as EmbeddingClient;

const done: ChatChunk = {
  type: 'done',
  doneReason: 'stop',
  promptTokens: 5,
  completionTokens: 2,
  loadDurationMs: 0,
  totalDurationMs: 10,
};

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason as Error);
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(signal.reason as Error);
    });
  });

/** Fake provider: never touches the network or a model. */
class FakeClient extends LlmClient {
  constructor(
    private readonly script: (signal: AbortSignal) => AsyncGenerator<ChatChunk>,
  ) {
    super();
  }
  streamChat(_request: ChatRequest, signal: AbortSignal) {
    return this.script(signal);
  }
  isModelLoaded() {
    return Promise.resolve(true);
  }
  listModels() {
    return Promise.resolve([]);
  }
}

describe('LlmService', () => {
  it('streams chunks to the caller and returns the final usage', async () => {
    const service = new LlmService(
      new FakeClient(async function* () {
        yield { type: 'thinking', text: 'hmm' };
        yield { type: 'content', text: 'o' };
        yield { type: 'content', text: 'k' };
        yield done;
      }),
      env,
      noEmbedder,
    );
    const chunks: string[] = [];

    const result = await service.chat(request, {
      priority: LlmPriority.Chat,
      onChunk: (c) => chunks.push(`${c.type}:${c.text}`),
    });

    expect(chunks).toEqual(['thinking:hmm', 'content:o', 'content:k']);
    expect(result).toMatchObject({ doneReason: 'stop', completionTokens: 2 });
  });

  it('aborts when the first chunk takes too long', async () => {
    const service = new LlmService(
      new FakeClient(async function* (signal) {
        await sleep(1000, signal);
        yield done;
      }),
      env,
      noEmbedder,
    );

    await expect(
      service.chat(request, { priority: LlmPriority.Chat }),
    ).rejects.toMatchObject({ code: 'timeout_first_token' });
  });

  it('aborts a generation that exceeds the total timeout', async () => {
    const service = new LlmService(
      new FakeClient(async function* (signal) {
        while (true) {
          yield { type: 'content', text: '.' };
          await sleep(20, signal);
        }
      }),
      env,
      noEmbedder,
    );

    await expect(
      service.chat(request, { priority: LlmPriority.Chat }),
    ).rejects.toMatchObject({ code: 'timeout_total' });
  });

  it('stops the generation when the caller cancels', async () => {
    const controller = new AbortController();
    let providerSawAbort = false;
    const service = new LlmService(
      new FakeClient(async function* (signal) {
        signal.addEventListener('abort', () => (providerSawAbort = true));
        yield { type: 'content', text: 'partial' };
        await sleep(1000, signal);
        yield done;
      }),
      env,
      noEmbedder,
    );

    const call = service.chat(request, {
      priority: LlmPriority.Chat,
      signal: controller.signal,
      onChunk: () => controller.abort(),
    });

    await expect(call).rejects.toMatchObject({ code: 'aborted' });
    expect(providerSawAbort).toBe(true);
  });

  describe('embeddings', () => {
    it('share the queue with chat: never at the same time as a generation', async () => {
      const log: string[] = [];
      const embedder = {
        embed: async (_model: string, inputs: string[]) => {
          log.push('embed');
          return inputs.map(() => [0.1, 0.2]);
        },
        hasModel: async () => true,
      } as unknown as EmbeddingClient;
      const service = new LlmService(
        new FakeClient(async function* (signal) {
          log.push('chat:start');
          await sleep(30, signal);
          log.push('chat:end');
          yield done;
        }),
        env,
        embedder,
      );

      const chat = service.chat(request, { priority: LlmPriority.Chat });
      const vectors = service.embed(['a', 'b'], {
        priority: LlmPriority.Embedding,
      });

      await Promise.all([chat, vectors]);
      expect(log).toEqual(['chat:start', 'chat:end', 'embed']);
      expect(await vectors).toHaveLength(2);
    });

    it("preempt a background generation when it's the user's query", async () => {
      const embedder = {
        embed: async () => [[1]],
        hasModel: async () => true,
      } as unknown as EmbeddingClient;
      const service = new LlmService(
        new FakeClient(async function* (signal) {
          yield { type: 'content', text: '.' };
          await sleep(1000, signal);
          yield done;
        }),
        { ...baseEnv, LLM_TOTAL_TIMEOUT_MS: 5000 } as EnvironmentVariables,
        embedder,
      );

      const summary = service.chat(request, { priority: LlmPriority.Summary });
      await new Promise((resolve) => setTimeout(resolve, 10));
      const query = service.embed(['user question'], {
        priority: LlmPriority.Chat,
      });

      await expect(summary).rejects.toMatchObject({ code: 'preempted' });
      await expect(query).resolves.toEqual([[1]]);
    });
  });

  describe('preemption', () => {
    /** Echoes the model name; "slow-*" models take `delay` ms to finish. */
    class EchoClient extends LlmClient {
      async *streamChat(req: ChatRequest, signal: AbortSignal) {
        yield { type: 'content' as const, text: req.model };
        if (req.model.startsWith('slow')) await sleep(100, signal);
        yield done;
      }
      isModelLoaded() {
        return Promise.resolve(true);
      }
      listModels() {
        return Promise.resolve([]);
      }
    }
    const started = () => new Promise((resolve) => setTimeout(resolve, 10));

    it('interrupts background work so a chat does not wait for it', async () => {
      const service = new LlmService(new EchoClient(), env, noEmbedder);

      const summary = service.complete(
        { ...request, model: 'slow-summary' },
        { priority: LlmPriority.Summary },
      );
      await started();
      const chat = service.complete(
        { ...request, model: 'chat' },
        { priority: LlmPriority.Chat },
      );

      await expect(summary).rejects.toMatchObject({ code: 'preempted' });
      await expect(chat).resolves.toMatchObject({ content: 'chat' });
    });

    it('never interrupts another chat', async () => {
      const service = new LlmService(new EchoClient(), env, noEmbedder);

      const first = service.complete(
        { ...request, model: 'slow-chat' },
        { priority: LlmPriority.Chat },
      );
      await started();
      const second = service.complete(
        { ...request, model: 'chat' },
        { priority: LlmPriority.Chat },
      );

      await expect(first).resolves.toMatchObject({ content: 'slow-chat' });
      await expect(second).resolves.toMatchObject({ content: 'chat' });
    });
  });
});
