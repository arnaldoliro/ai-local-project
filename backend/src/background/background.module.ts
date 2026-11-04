import { Module } from '@nestjs/common';
import { ConversationsModule } from '../conversations/conversations.module.js';
import { LlmModule } from '../llm/llm.module.js';
import { SummaryService } from '../summaries/summary.service.js';
import { TitleService } from '../titles/title.service.js';
import { BackgroundJobsService } from './background-jobs.service.js';

@Module({
  imports: [ConversationsModule, LlmModule],
  providers: [TitleService, SummaryService, BackgroundJobsService],
  exports: [BackgroundJobsService],
})
export class BackgroundModule {}
