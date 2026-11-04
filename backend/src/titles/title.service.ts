import { Injectable, Logger } from '@nestjs/common';
import { EnvironmentVariables } from '../config/env.validation.js';
import { ConversationsService } from '../conversations/conversations.service.js';
import { withImagePlaceholder } from '../context/context-builder.js';
import { LlmService } from '../llm/llm.service.js';
import { noThinking } from '../chat/chat-settings.js';
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
      select: { title: true, model: true },
    });
    if (!conversation || conversation.title) return;

    const firstUser = await this.prisma.message.findFirst({
      where: { conversationId, role: 'user' },
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { attachments: true } } },
    });
    const firstAnswer = await this.prisma.message.findFirst({
      where: { conversationId, role: 'assistant', status: 'complete' },
      orderBy: { createdAt: 'asc' },
    });
    if (!firstUser || !firstAnswer) return;

    // Same model as the conversation: a different one would force Ollama to
    // swap models in VRAM (only one fits) right after every answer.
    const model = conversation.model ?? this.env.LLM_DEFAULT_MODEL;
    const capabilities = (await this.llm.findModel(model))?.capabilities;

    const { content } = await this.llm.complete(
      {
        model,
        messages: [
          { role: 'system', content: TITLE_SYSTEM_PROMPT },
          {
            role: 'user',
            content: buildTitlePrompt(
              firstUser._count.attachments
                ? withImagePlaceholder(
                    firstUser.content,
                    firstUser._count.attachments,
                  )
                : firstUser.content,
              firstAnswer.content,
            ),
          },
        ],
        think: noThinking(capabilities ?? null),
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
