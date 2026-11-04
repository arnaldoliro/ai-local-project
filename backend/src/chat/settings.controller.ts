import { Controller, Get } from '@nestjs/common';
import {
  SYSTEM_PROMPT_MAX_LENGTH,
  TEMPERATURE_MAX,
  TEMPERATURE_MIN,
} from './chat-settings.js';
import { ChatService } from './chat.service.js';

/** What the settings panel needs to show "default" values and limits. */
@Controller('settings')
export class SettingsController {
  constructor(private readonly chat: ChatService) {}

  @Get('defaults')
  defaults() {
    const { model, systemPrompt } = this.chat.defaults();
    return {
      model,
      systemPrompt,
      systemPromptMaxLength: SYSTEM_PROMPT_MAX_LENGTH,
      temperature: { min: TEMPERATURE_MIN, max: TEMPERATURE_MAX },
    };
  }
}
