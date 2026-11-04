import type { EnvironmentVariables } from '../config/env.validation.js';
import { LlmClient } from './llm-client.js';
import { LlmService } from './llm.service.js';
import type { ChatChunk, ChatRequest } from './llm.types.js';
import { LlmPriority } from './llm.types.js';

const env = {
  LLM_QUEUE_MAX_SIZE: 10,
  LLM_FIRST_TOKEN_TIMEOUT_MS: 50,
  LLM_TOTAL_TIMEOUT_MS: 200,
} as EnvironmentVariables;

const request: ChatRequest = {
  model: 'fake',
  messages: [{ role: 'user', content: 'hi' }],
  think: false,
  maxOutputTokens: 16,
};

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
    );

    const call = service.chat(request, {
      priority: LlmPriority.Chat,
      signal: controller.signal,
      onChunk: () => controller.abort(),
    });

    await expect(call).rejects.toMatchObject({ code: 'aborted' });
    expect(providerSawAbort).toBe(true);
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
      const service = new LlmService(new EchoClient(), env);

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
      const service = new LlmService(new EchoClient(), env);

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
