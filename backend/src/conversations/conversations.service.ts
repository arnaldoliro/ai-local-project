import { Injectable, NotFoundException } from '@nestjs/common';
import type { Conversation } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  toConversationDto,
  toMessageDto,
  type ConversationDto,
  type ConversationWithMessagesDto,
} from './conversation.dto.js';
import { ConversationEventsService } from './conversation-events.service.js';

/** Plenty for a single local user; avoids an unbounded query. */
const LIST_LIMIT = 200;

@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: ConversationEventsService,
  ) {}

  async list(): Promise<ConversationDto[]> {
    const conversations = await this.prisma.conversation.findMany({
      orderBy: { updatedAt: 'desc' },
      take: LIST_LIMIT,
    });
    return conversations.map(toConversationDto);
  }

  async create(): Promise<ConversationDto> {
    const dto = toConversationDto(
      await this.prisma.conversation.create({ data: {} }),
    );
    this.events.emit({ type: 'conversation.updated', conversation: dto });
    return dto;
  }

  async getWithMessages(id: string): Promise<ConversationWithMessagesDto> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');

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

  async rename(id: string, title: string): Promise<ConversationDto> {
    await this.getOrThrow(id);
    return this.updateAndEmit(id, { title });
  }

  /** Messages go with it (ON DELETE CASCADE). */
  async delete(id: string): Promise<void> {
    await this.getOrThrow(id);
    await this.prisma.conversation.delete({ where: { id } });
    this.events.emit({ type: 'conversation.deleted', id });
  }

  /** Bumps updatedAt so the conversation moves to the top of the list. */
  async touch(id: string): Promise<void> {
    await this.updateAndEmit(id, { updatedAt: new Date() });
  }

  /**
   * Sets a model-generated title only if there is still none: if the user
   * renamed the conversation meanwhile, their title wins.
   */
  async setGeneratedTitle(id: string, title: string): Promise<boolean> {
    const { count } = await this.prisma.conversation.updateMany({
      where: { id, title: null },
      data: { title },
    });
    if (count > 0) await this.emitCurrent(id);
    return count > 0;
  }

  /**
   * Optimistic update: only applies if nobody advanced the summary since it
   * was read (`expectedUntil`), so two runs can never interleave.
   */
  async saveSummary(
    id: string,
    summary: string,
    summarizedUntil: Date,
    expectedUntil: Date | null,
  ): Promise<boolean> {
    const { count } = await this.prisma.conversation.updateMany({
      where: { id, summarizedUntil: expectedUntil },
      data: { summary, summarizedUntil },
    });
    return count > 0;
  }

  private async updateAndEmit(
    id: string,
    data: { title?: string; updatedAt?: Date },
  ): Promise<ConversationDto> {
    const dto = toConversationDto(
      await this.prisma.conversation.update({ where: { id }, data }),
    );
    this.events.emit({ type: 'conversation.updated', conversation: dto });
    return dto;
  }

  private async emitCurrent(id: string): Promise<void> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
    });
    if (conversation) {
      this.events.emit({
        type: 'conversation.updated',
        conversation: toConversationDto(conversation),
      });
    }
  }
}
