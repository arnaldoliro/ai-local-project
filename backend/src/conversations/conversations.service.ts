import { Injectable, NotFoundException } from '@nestjs/common';
import type { Conversation } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  toConversationDto,
  toMessageDto,
  type ConversationDto,
  type ConversationWithMessagesDto,
} from './conversation.dto.js';

@Injectable()
export class ConversationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(): Promise<ConversationDto> {
    return toConversationDto(
      await this.prisma.conversation.create({ data: {} }),
    );
  }

  /** Phase 1 shows a single conversation: the most recently active one. */
  async findCurrent(): Promise<ConversationWithMessagesDto | null> {
    const conversation = await this.prisma.conversation.findFirst({
      orderBy: { updatedAt: 'desc' },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!conversation) return null;

    return {
      ...toConversationDto(conversation),
      messages: conversation.messages.map(toMessageDto),
    };
  }

  async getOrThrow(id: string): Promise<Conversation> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    return conversation;
  }

  /** Bumps updatedAt so the conversation counts as the most recent. */
  async touch(id: string): Promise<void> {
    await this.prisma.conversation.update({
      where: { id },
      data: { updatedAt: new Date() },
    });
  }
}
