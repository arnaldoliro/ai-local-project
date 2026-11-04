import { Module } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module.js';
import { MemoryService } from './memory.service.js';

@Module({
  imports: [LlmModule],
  providers: [MemoryService],
  exports: [MemoryService],
})
export class MemoryModule {}
