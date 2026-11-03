import { LlmError } from './llm.errors.js';
import { LlmQueue } from './llm-queue.js';
import { LlmPriority } from './llm.types.js';

/** A task that only finishes when the test calls `release()`. */
function deferredTask<T>(value: T) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  return { task: () => gate.then(() => value), release };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

describe('LlmQueue', () => {
  it('never runs two tasks at the same time', async () => {
    const queue = new LlmQueue(10);
    let running = 0;
    let maxRunning = 0;

    const task = async () => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await tick();
      running--;
    };

    await Promise.all(
      Array.from({ length: 5 }, () =>
        queue.run(task, { priority: LlmPriority.Chat }),
      ),
    );

    expect(maxRunning).toBe(1);
  });

  it('serves higher priority first, FIFO within the same priority', async () => {
    const queue = new LlmQueue(10);
    const order: string[] = [];
    const blocker = deferredTask(undefined);
    const log = (name: string) => async () => void order.push(name);

    const running = queue.run(blocker.task, { priority: LlmPriority.Chat });
    const all = [
      queue.run(log('embedding'), { priority: LlmPriority.Embedding }),
      queue.run(log('title'), { priority: LlmPriority.Title }),
      queue.run(log('chat-1'), { priority: LlmPriority.Chat }),
      queue.run(log('chat-2'), { priority: LlmPriority.Chat }),
    ];

    blocker.release();
    await Promise.all([running, ...all]);

    expect(order).toEqual(['chat-1', 'chat-2', 'title', 'embedding']);
  });

  it('rejects with queue_full instead of piling up work', async () => {
    const queue = new LlmQueue(1);
    const blocker = deferredTask(undefined);

    const running = queue.run(blocker.task, { priority: LlmPriority.Chat });
    const waiting = queue.run(async () => {}, { priority: LlmPriority.Chat });

    await expect(
      queue.run(async () => {}, { priority: LlmPriority.Chat }),
    ).rejects.toMatchObject({ code: 'queue_full' });
    expect(queue.hasCapacity()).toBe(false);

    blocker.release();
    await Promise.all([running, waiting]);
  });

  it('removes an aborted job from the queue without running it', async () => {
    const queue = new LlmQueue(10);
    const blocker = deferredTask(undefined);
    const controller = new AbortController();
    let ran = false;

    const running = queue.run(blocker.task, { priority: LlmPriority.Chat });
    const queued = queue.run(async () => void (ran = true), {
      priority: LlmPriority.Chat,
      signal: controller.signal,
    });

    controller.abort();
    await expect(queued).rejects.toBeInstanceOf(LlmError);
    expect(queue.pendingCount).toBe(0);

    blocker.release();
    await running;
    expect(ran).toBe(false);
  });

  it('reports how many jobs are ahead while waiting', async () => {
    const queue = new LlmQueue(10);
    const blocker = deferredTask(undefined);
    const positions: number[] = [];

    const running = queue.run(blocker.task, { priority: LlmPriority.Chat });
    const first = queue.run(async () => {}, { priority: LlmPriority.Chat });
    const second = queue.run(async () => {}, {
      priority: LlmPriority.Chat,
      onPosition: (p) => positions.push(p),
    });

    blocker.release();
    await Promise.all([running, first, second]);

    // Behind the running job and `first`, then only behind `first`.
    expect(positions).toEqual([2, 1]);
  });

  it('reports no position for a job that starts right away', async () => {
    const queue = new LlmQueue(10);
    const positions: number[] = [];

    await queue.run(async () => {}, {
      priority: LlmPriority.Chat,
      onPosition: (p) => positions.push(p),
    });

    expect(positions).toEqual([]);
  });

  it('keeps working after a task fails', async () => {
    const queue = new LlmQueue(10);

    const failing = queue.run(
      async () => {
        throw new Error('boom');
      },
      { priority: LlmPriority.Chat },
    );
    const next = queue.run(async () => 'ok', { priority: LlmPriority.Chat });

    await expect(failing).rejects.toThrow('boom');
    await expect(next).resolves.toBe('ok');
  });
});
