import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import type { Subscription } from 'rxjs';
import { ConversationEventsService } from '../conversations/conversation-events.service.js';
import { LlmError } from '../llm/llm.errors.js';
import { MemoryService } from '../memory/memory.service.js';
import { SummaryService } from '../summaries/summary.service.js';
import { TitleService } from '../titles/title.service.js';

/** Re-queues after preemption at most this many times in a row. */
const MAX_PREEMPTION_RETRIES = 3;

/**
 * Work that follows a completed answer: title, then summary, then memory
 * indexing (embeddings of the exchange).
 *
 * - Fire-and-forget for the chat (the user already has the answer).
 * - Per conversation, runs strictly one after the other: a new run is
 *   chained after the previous one, so two runs never plan the same work.
 * - Globally, every model call still goes through the LLM queue at low
 *   priority, and a user's chat preempts it (the work is then re-queued).
 * - Deleting a conversation aborts its pending work.
 */
@Injectable()
export class BackgroundJobsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BackgroundJobsService.name);
  private readonly chains = new Map<string, Promise<void>>();
  private readonly controllers = new Map<string, AbortController>();
  private readonly retries = new Map<string, number>();
  private subscription?: Subscription;

  constructor(
    private readonly titles: TitleService,
    private readonly summaries: SummaryService,
    private readonly events: ConversationEventsService,
    private readonly memory: MemoryService,
  ) {}

  onModuleInit(): void {
    this.subscription = this.events.events$.subscribe((event) => {
      if (event.type === 'conversation.deleted') this.cancel(event.id);
    });
  }

  onModuleDestroy(): void {
    this.subscription?.unsubscribe();
    for (const controller of this.controllers.values()) controller.abort();
  }

  afterExchange(conversationId: string): void {
    let controller = this.controllers.get(conversationId);
    if (!controller || controller.signal.aborted) {
      controller = new AbortController();
      this.controllers.set(conversationId, controller);
    }
    const { signal } = controller;

    const previous = this.chains.get(conversationId) ?? Promise.resolve();
    const next: Promise<void> = previous
      .then(async () => {
        if (signal.aborted) return;
        await this.titles.generateIfNeeded(conversationId, signal);
        if (signal.aborted) return;
        await this.summaries.summarizeIfNeeded(conversationId, signal);
        if (signal.aborted) return;
        await this.memory.indexConversation(conversationId, signal);
      })
      .then(() => {
        this.retries.delete(conversationId);
      })
      .catch((error: unknown) =>
        this.handleFailure(conversationId, error, signal),
      )
      .finally(() => {
        if (this.chains.get(conversationId) === next) {
          this.chains.delete(conversationId);
          this.controllers.delete(conversationId);
        }
      });

    this.chains.set(conversationId, next);
  }

  private cancel(conversationId: string): void {
    this.controllers.get(conversationId)?.abort();
  }

  private handleFailure(
    conversationId: string,
    error: unknown,
    signal: AbortSignal,
  ): void {
    if (error instanceof LlmError) {
      // A chat took the model: queue the work again (low priority, so it
      // runs once the chat is done) instead of waiting for the next exchange,
      // which may never come for this conversation.
      if (error.code === 'preempted' && !signal.aborted) {
        const attempts = (this.retries.get(conversationId) ?? 0) + 1;
        if (attempts <= MAX_PREEMPTION_RETRIES) {
          this.retries.set(conversationId, attempts);
          this.logger.debug(`Re-queued work for ${conversationId} (preempted)`);
          this.afterExchange(conversationId);
          return;
        }
      }
      // Expected and harmless: retried after the next exchange.
      if (['aborted', 'preempted', 'queue_full'].includes(error.code)) {
        this.logger.debug(
          `Background work for ${conversationId}: ${error.code}`,
        );
        return;
      }
    }
    this.logger.warn(
      `Background work for ${conversationId} failed: ${(error as Error).message}`,
    );
  }
}
