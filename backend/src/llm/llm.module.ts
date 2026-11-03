import { Module } from '@nestjs/common';
import { LlmClient } from './llm-client.js';
import { LlmService } from './llm.service.js';
import { OllamaClient } from './ollama/ollama.client.js';

@Module({
  providers: [{ provide: LlmClient, useClass: OllamaClient }, LlmService],
  // Only the service is exported: no module can reach the client directly
  // and bypass the queue.
  exports: [LlmService],
})
export class LlmModule {}
