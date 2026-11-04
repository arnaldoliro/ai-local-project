import { Module } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module.js';
import { ConversationEventsService } from './conversation-events.service.js';
import { ConversationsController } from './conversations.controller.js';
import { ConversationsService } from './conversations.service.js';
import { EventsController } from './events.controller.js';

@Module({
  imports: [LlmModule],
  controllers: [ConversationsController, EventsController],
  providers: [ConversationsService, ConversationEventsService],
  exports: [ConversationsService, ConversationEventsService],
})
export class ConversationsModule {}
