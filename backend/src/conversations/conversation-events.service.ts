import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Subject } from 'rxjs';
import type { ConversationDto } from './conversation.dto.js';

export type ConversationEvent =
  | { type: 'conversation.updated'; conversation: ConversationDto }
  | { type: 'conversation.deleted'; id: string };

/**
 * In-process event bus for conversation changes.
 *
 * Feeds two consumers: the GET /events stream (so the sidebar sees a
 * generated title the moment it exists) and the background jobs (so they
 * stop working on a deleted conversation). RxJS already ships with Nest.
 */
@Injectable()
export class ConversationEventsService implements OnModuleDestroy {
  private readonly subject = new Subject<ConversationEvent>();
  readonly events$ = this.subject.asObservable();

  emit(event: ConversationEvent): void {
    this.subject.next(event);
  }

  onModuleDestroy(): void {
    this.subject.complete();
  }
}
