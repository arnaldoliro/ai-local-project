import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ConversationsService } from './conversations.service.js';
import {
  ConversationSettingsDto,
  UpdateConversationDto,
} from './conversation-settings.dto.js';

@Controller('conversations')
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @Get()
  list() {
    return this.conversations.list();
  }

  /** Body optional: a new chat may be configured before the first message. */
  @Post()
  create(@Body() dto?: ConversationSettingsDto) {
    return this.conversations.create(dto ?? {});
  }

  @Get(':id')
  get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.conversations.getWithMessages(id);
  }

  /** Rename and/or change settings. */
  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateConversationDto,
  ) {
    return this.conversations.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async delete(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    await this.conversations.delete(id);
  }
}
