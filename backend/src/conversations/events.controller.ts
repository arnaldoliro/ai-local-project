import { Controller, Sse, type MessageEvent } from '@nestjs/common';
import { interval, map, merge, type Observable } from 'rxjs';
import { ConversationEventsService } from './conversation-events.service.js';

const HEARTBEAT_MS = 25_000;

/**
 * Server -> browser push channel. Here a GET is all we need, so Nest's
 * @Sse() fits (unlike the chat stream, which needs a POST body) and the
 * browser can use the native EventSource, which reconnects by itself.
 */
@Controller('events')
export class EventsController {
  constructor(private readonly events: ConversationEventsService) {}

  @Sse()
  stream(): Observable<MessageEvent> {
    const updates = this.events.events$.pipe(
      map((event): MessageEvent => ({ type: event.type, data: event })),
    );
    const heartbeat = interval(HEARTBEAT_MS).pipe(
      map((): MessageEvent => ({ type: 'ping', data: {} })),
    );
    return merge(updates, heartbeat);
  }
}
