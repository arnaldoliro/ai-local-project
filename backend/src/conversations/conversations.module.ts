import { Module } from '@nestjs/common';
import { ConversationEventsService } from './conversation-events.service.js';
import { ConversationsController } from './conversations.controller.js';
import { ConversationsService } from './conversations.service.js';
import { EventsController } from './events.controller.js';

@Module({
  controllers: [ConversationsController, EventsController],
  providers: [ConversationsService, ConversationEventsService],
  exports: [ConversationsService, ConversationEventsService],
})
export class ConversationsModule {}
