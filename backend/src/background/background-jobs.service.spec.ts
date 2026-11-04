import { LlmError } from '../llm/llm.errors.js';
import { ConversationEventsService } from '../conversations/conversation-events.service.js';
import type { SummaryService } from '../summaries/summary.service.js';
import type { TitleService } from '../titles/title.service.js';
import type { MemoryService } from '../memory/memory.service.js';
import { BackgroundJobsService } from './background-jobs.service.js';

const noMemory = {
  indexConversation: async () => {},
} as unknown as MemoryService;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Records the order of calls and lets each one take `ms`. */
function fakes(ms = 20) {
  const log: string[] = [];
  let running = 0;
  let maxRunning = 0;
  const step = (name: string) => async (id: string, signal: AbortSignal) => {
    running++;
    maxRunning = Math.max(maxRunning, running);
    log.push(`${name}:${id}:start`);
    await sleep(ms);
    running--;
    log.push(`${name}:${id}:${signal.aborted ? 'aborted' : 'end'}`);
  };
  const titles = { generateIfNeeded: step('title') } as unknown as TitleService;
  const summaries = {
    summarizeIfNeeded: step('summary'),
  } as unknown as SummaryService;
  return { titles, summaries, log, maxRunning: () => maxRunning };
}

describe('BackgroundJobsService', () => {
  it('runs title then summary, one run at a time per conversation', async () => {
    const { titles, summaries, log, maxRunning } = fakes();
    const jobs = new BackgroundJobsService(
      titles,
      summaries,
      new ConversationEventsService(),
      noMemory,
    );

    jobs.afterExchange('a');
    jobs.afterExchange('a');
    await sleep(120);

    expect(log).toEqual([
      'title:a:start',
      'title:a:end',
      'summary:a:start',
      'summary:a:end',
      'title:a:start',
      'title:a:end',
      'summary:a:start',
      'summary:a:end',
    ]);
    expect(maxRunning()).toBe(1);
  });

  it('re-queues the work when a chat preempts it', async () => {
    let titleCalls = 0;
    const titles = {
      generateIfNeeded: async () => {
        titleCalls++;
        if (titleCalls === 1) throw new LlmError('preempted');
      },
    } as unknown as TitleService;
    const summaries = {
      summarizeIfNeeded: async () => {},
    } as unknown as SummaryService;
    const jobs = new BackgroundJobsService(
      titles,
      summaries,
      new ConversationEventsService(),
      noMemory,
    );

    jobs.afterExchange('a');
    await sleep(20);

    expect(titleCalls).toBe(2);
  });

  it('aborts pending work when the conversation is deleted', async () => {
    const { titles, summaries, log } = fakes();
    const events = new ConversationEventsService();
    const jobs = new BackgroundJobsService(titles, summaries, events, noMemory);
    jobs.onModuleInit();

    jobs.afterExchange('a');
    await sleep(5);
    events.emit({ type: 'conversation.deleted', id: 'a' });
    await sleep(60);

    // The summary never starts once the conversation is gone.
    expect(log).toEqual(['title:a:start', 'title:a:aborted']);
    jobs.onModuleDestroy();
  });
});
