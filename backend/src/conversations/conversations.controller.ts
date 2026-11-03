import { Controller, Get, Post } from '@nestjs/common';
import { ConversationsService } from './conversations.service.js';

@Controller('conversations')
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @Post()
  create() {
    return this.conversations.create();
  }

  /** Wrapped in an object so "no conversation yet" is `{ conversation: null }`. */
  @Get('current')
  async current() {
    return { conversation: await this.conversations.findCurrent() };
  }
}
