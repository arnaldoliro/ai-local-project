import { Injectable, Logger } from '@nestjs/common';
import { EnvironmentVariables } from '../config/env.validation.js';
import { ConversationsService } from '../conversations/conversations.service.js';
import { LlmService } from '../llm/llm.service.js';
import { LlmPriority } from '../llm/llm.types.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  buildTitlePrompt,
  sanitizeTitle,
  TITLE_MAX_OUTPUT_TOKENS,
  TITLE_SYSTEM_PROMPT,
} from './title.prompt.js';

@Injectable()
export class TitleService {
  private readonly logger = new Logger(TitleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly conversations: ConversationsService,
    private readonly llm: LlmService,
    private readonly env: EnvironmentVariables,
  ) {}

  /** Names the conversation after its first complete exchange, once. */
  async generateIfNeeded(
    conversationId: string,
    signal: AbortSignal,
  ): Promise<void> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { title: true },
    });
    if (!conversation || conversation.title) return;

    const firstUser = await this.prisma.message.findFirst({
      where: { conversationId, role: 'user' },
      orderBy: { createdAt: 'asc' },
    });
    const firstAnswer = await this.prisma.message.findFirst({
      where: { conversationId, role: 'assistant', status: 'complete' },
      orderBy: { createdAt: 'asc' },
    });
    if (!firstUser || !firstAnswer) return;

    const { content } = await this.llm.complete(
      {
        model: this.env.LLM_DEFAULT_MODEL,
        messages: [
          { role: 'system', content: TITLE_SYSTEM_PROMPT },
          {
            role: 'user',
            content: buildTitlePrompt(firstUser.content, firstAnswer.content),
          },
        ],
        think: false,
        maxOutputTokens: TITLE_MAX_OUTPUT_TOKENS,
        temperature: 0.3,
      },
      { priority: LlmPriority.Title, signal },
    );

    const title = sanitizeTitle(content);
    if (!title) {
      this.logger.warn(
        `Unusable title from the model: ${JSON.stringify(content)}`,
      );
      return;
    }
    if (await this.conversations.setGeneratedTitle(conversationId, title)) {
      this.logger.log(`Titled ${conversationId}: "${title}"`);
    }
  }
}
