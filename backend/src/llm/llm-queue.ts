import { LlmError } from './llm.errors.js';
import { LlmPriority } from './llm.types.js';

interface Job {
  priority: LlmPriority;
  start: () => Promise<void>;
  onPosition?: (position: number) => void;
}

export interface EnqueueOptions {
  priority: LlmPriority;
  /** Aborting while still waiting removes the job without ever running it. */
  signal?: AbortSignal;
  /** Called with how many jobs are ahead (running one included) on every change. */
  onPosition?: (position: number) => void;
}

/**
 * In-memory priority queue with concurrency fixed at 1.
 *
 * This is the backend's main machine-protection mechanism: no matter how many
 * requests arrive, the model never receives two calls at once. There is no
 * `Promise.all` path around it: work is only ever started by `drain()`, one
 * job after the previous one settled.
 *
 * Why not BullMQ: it needs Redis, a whole extra service, to coordinate
 * workers we don't have. A single-user app with one process needs ~80 lines.
 */
export class LlmQueue {
  private readonly pending: Job[] = [];
  private running = false;

  constructor(private readonly maxPending: number) {}

  get pendingCount(): number {
    return this.pending.length;
  }

  get isBusy(): boolean {
    return this.running;
  }

  hasCapacity(): boolean {
    return this.pending.length < this.maxPending;
  }

  run<T>(task: () => Promise<T>, options: EnqueueOptions): Promise<T> {
    const { priority, signal, onPosition } = options;

    if (signal?.aborted) {
      return Promise.reject(new LlmError('aborted', 'Aborted before queueing'));
    }
    if (!this.hasCapacity()) {
      return Promise.reject(new LlmError('queue_full', 'LLM queue is full'));
    }

    return new Promise<T>((resolve, reject) => {
      const onAbort = () => {
        const index = this.pending.indexOf(job);
        if (index === -1) return; // already running: the task handles its signal
        this.pending.splice(index, 1);
        reject(new LlmError('aborted', 'Aborted while queued'));
        this.notifyPositions();
      };

      const job: Job = {
        priority,
        onPosition,
        start: () => {
          signal?.removeEventListener('abort', onAbort);
          // Promise.resolve().then() also catches a task that throws synchronously.
          return Promise.resolve().then(task).then(resolve, reject);
        },
      };

      signal?.addEventListener('abort', onAbort, { once: true });
      this.insert(job);
      // When idle, drain() starts this job immediately: it never waits, so it
      // gets no position update. Otherwise everyone learns where they stand.
      if (this.running) this.notifyPositions();
      this.drain();
    });
  }

  /** Keeps `pending` sorted by priority, FIFO within the same priority. */
  private insert(job: Job): void {
    const index = this.pending.findIndex((p) => p.priority > job.priority);
    if (index === -1) this.pending.push(job);
    else this.pending.splice(index, 0, job);
  }

  private drain(): void {
    if (this.running) return;
    const job = this.pending.shift();
    if (!job) return;

    this.running = true;
    this.notifyPositions();
    void job.start().finally(() => {
      this.running = false;
      this.drain();
    });
  }

  private notifyPositions(): void {
    const ahead = this.running ? 1 : 0;
    this.pending.forEach((job, index) => job.onPosition?.(index + ahead));
  }
}
