import { Controller, Get } from '@nestjs/common';
import { EnvironmentVariables } from '../config/env.validation.js';
import { LlmService } from './llm.service.js';

@Controller('models')
export class ModelsController {
  constructor(
    private readonly llm: LlmService,
    private readonly env: EnvironmentVariables,
  ) {}

  /** Models that can chat (embedding-only models are left out). */
  @Get()
  async list() {
    const models = await this.llm.listModels();
    return {
      defaultModel: this.env.LLM_DEFAULT_MODEL,
      models: models
        .filter((m) => m.capabilities.completion)
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  }
}
