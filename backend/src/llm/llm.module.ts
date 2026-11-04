import { Module } from '@nestjs/common';
import { EmbeddingClient } from './embedding-client.js';
import { LlmClient } from './llm-client.js';
import { LlmService } from './llm.service.js';
import { ModelsController } from './models.controller.js';
import { OllamaEmbeddingClient } from './ollama/ollama-embedding.client.js';
import { OllamaClient } from './ollama/ollama.client.js';

@Module({
  controllers: [ModelsController],
  providers: [
    { provide: LlmClient, useClass: OllamaClient },
    { provide: EmbeddingClient, useClass: OllamaEmbeddingClient },
    LlmService,
  ],
  // Only the service is exported: no module can reach either client
  // directly and bypass the queue.
  exports: [LlmService],
})
export class LlmModule {}
