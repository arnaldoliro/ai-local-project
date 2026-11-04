import { Module } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module.js';
import { HealthController } from './health.controller.js';

@Module({
  imports: [LlmModule],
  controllers: [HealthController],
})
export class HealthModule {}
