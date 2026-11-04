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
import { RenameConversationDto } from './rename-conversation.dto.js';

@Controller('conversations')
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @Get()
  list() {
    return this.conversations.list();
  }

  @Post()
  create() {
    return this.conversations.create();
  }

  @Get(':id')
  get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.conversations.getWithMessages(id);
  }

  @Patch(':id')
  rename(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: RenameConversationDto,
  ) {
    return this.conversations.rename(id, dto.title);
  }

  @Delete(':id')
  @HttpCode(204)
  async delete(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    await this.conversations.delete(id);
  }
}
