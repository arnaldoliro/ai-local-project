import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Conversation } from '../generated/prisma/client.js';
import { LlmService } from '../llm/llm.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  toConversationDto,
  toMessageDto,
  type ConversationDto,
  type ConversationWithMessagesDto,
} from './conversation.dto.js';
import { ConversationEventsService } from './conversation-events.service.js';
import type {
  ConversationSettingsDto,
  UpdateConversationDto,
} from './conversation-settings.dto.js';

/** Plenty for a single local user; avoids an unbounded query. */
const LIST_LIMIT = 200;

@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: ConversationEventsService,
    private readonly llm: LlmService,
  ) {}

  async list(): Promise<ConversationDto[]> {
    const conversations = await this.prisma.conversation.findMany({
      orderBy: { updatedAt: 'desc' },
      take: LIST_LIMIT,
    });
    return conversations.map(toConversationDto);
  }

  async create(settings: ConversationSettingsDto): Promise<ConversationDto> {
    const data = await this.settingsData(settings);
    const dto = toConversationDto(
      await this.prisma.conversation.create({ data }),
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

  async update(
    id: string,
    dto: UpdateConversationDto,
  ): Promise<ConversationDto> {
    await this.getOrThrow(id);
    return this.updateAndEmit(id, {
      ...(typeof dto.title === 'string' && { title: dto.title }),
      ...(await this.settingsData(dto)),
    });
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

  /**
   * Only the fields present in the DTO (undefined = unchanged). An empty
   * system prompt is stored as null, i.e. "use the default".
   */
  private async settingsData(settings: ConversationSettingsDto) {
    const { model, systemPrompt, temperature } = settings;
    if (model) await this.assertChatModel(model);

    return {
      ...(model !== undefined && { model }),
      ...(systemPrompt !== undefined && {
        systemPrompt: systemPrompt?.trim() || null,
      }),
      ...(temperature !== undefined && { temperature }),
    };
  }

  private async assertChatModel(model: string): Promise<void> {
    const info = await this.llm.findModel(model);
    if (!info?.capabilities.completion) {
      throw new BadRequestException({
        code: 'unknown_model',
        message: `Model "${model}" is not installed or cannot chat`,
      });
    }
  }

  private async updateAndEmit(
    id: string,
    data: {
      title?: string;
      updatedAt?: Date;
      model?: string | null;
      systemPrompt?: string | null;
      temperature?: number | null;
    },
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
