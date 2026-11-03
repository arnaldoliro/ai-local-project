import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ChatService } from './chat.service.js';
import { SendMessageDto } from './send-message.dto.js';
import { SseStream } from './sse-stream.js';

@Controller('conversations/:conversationId/messages')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  /**
   * Sends a message and streams the answer as Server-Sent Events.
   *
   * Events: start, queued, generating, thinking, content, done | error.
   * Closing the connection (tab closed, "stop" clicked) aborts the model call.
   */
  @Post()
  async send(
    @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
    @Body() dto: SendMessageDto,
    @Res() res: Response,
  ): Promise<void> {
    // Throws before any byte is written -> regular JSON error response.
    const prepared = await this.chat.prepare(conversationId, dto);

    const sse = new SseStream(res);
    const controller = new AbortController();
    // `close` on the response fires when the client goes away mid-stream.
    res.on('close', () => {
      if (!res.writableFinished) controller.abort();
    });

    try {
      await this.chat.stream(prepared, sse, controller.signal);
    } finally {
      sse.end();
    }
  }
}
