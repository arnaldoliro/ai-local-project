import { Injectable, Logger } from '@nestjs/common';
import { EnvironmentVariables } from '../config/env.validation.js';
import { CONTEXT_MESSAGE_FILTER } from '../conversations/context-messages.js';
import { ConversationsService } from '../conversations/conversations.service.js';
import { withImagePlaceholder } from '../context/context-builder.js';
import { LlmService } from '../llm/llm.service.js';
import { noThinking } from '../chat/chat-settings.js';
import { LlmPriority } from '../llm/llm.types.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  selectMessagesToSummarize,
  takeSummaryChunk,
  type SummarizableMessage,
  type SummaryPolicy,
} from './summary-planner.js';
import {
  buildSummaryPrompt,
  SUMMARY_MAX_OUTPUT_TOKENS,
  SUMMARY_SYSTEM_PROMPT,
} from './summary.prompt.js';

/** Bounds the work done after a single exchange; the rest waits for the next one. */
const MAX_ROUNDS_PER_RUN = 3;

@Injectable()
export class SummaryService {
  private readonly logger = new Logger(SummaryService.name);
  private readonly policy: SummaryPolicy;

  constructor(
    private readonly prisma: PrismaService,
    private readonly conversations: ConversationsService,
    private readonly llm: LlmService,
    private readonly env: EnvironmentVariables,
  ) {
    // With the default 4096 window: ~2662 prompt tokens per chat request.
    // Summarize when the raw history would take ~60% of that; afterwards only
    // ~30% stays as raw history, next to a summary of up to 384 tokens.
    this.policy = {
      triggerTokens: 1600,
      triggerMessages: env.CONTEXT_MAX_HISTORY_MESSAGES,
      keepTokens: 800,
      keepMinMessages: 2,
      // A summarization call: 4096 - 384 (answer) - 410 (margin) = ~3300,
      // minus instructions and the previous summary.
      chunkTokens: 2000,
      maxMessageTokens: 700,
    };
  }

  /**
   * Folds old messages into the conversation summary, oldest first, one
   * model call at a time (sequential awaits, never Promise.all).
   */
  async summarizeIfNeeded(
    conversationId: string,
    signal: AbortSignal,
  ): Promise<void> {
    for (let round = 0; round < MAX_ROUNDS_PER_RUN; round++) {
      if (signal.aborted) return;

      const conversation = await this.prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { summary: true, summarizedUntil: true, model: true },
      });
      if (!conversation) return;

      const pending = await this.loadUnsummarized(
        conversationId,
        conversation.summarizedUntil,
      );
      const toSummarize = selectMessagesToSummarize(pending, this.policy);
      if (toSummarize.length === 0) return;

      const chunk = takeSummaryChunk(toSummarize, this.policy);
      // Same model as the conversation, to avoid a model swap in VRAM.
      const model = conversation.model ?? this.env.LLM_DEFAULT_MODEL;
      const capabilities = (await this.llm.findModel(model))?.capabilities;
      const { content } = await this.llm.complete(
        {
          model,
          messages: [
            { role: 'system', content: SUMMARY_SYSTEM_PROMPT },
            {
              role: 'user',
              content: buildSummaryPrompt(conversation.summary, chunk),
            },
          ],
          think: noThinking(capabilities ?? null),
          maxOutputTokens: SUMMARY_MAX_OUTPUT_TOKENS,
          temperature: 0.2,
        },
        { priority: LlmPriority.Summary, signal },
      );

      const summary = content.trim();
      if (!summary) return;

      const until = chunk[chunk.length - 1].createdAt;
      const saved = await this.conversations.saveSummary(
        conversationId,
        summary,
        until,
        conversation.summarizedUntil,
      );
      if (!saved) return;
      this.logger.log(
        `Summarized ${chunk.length} message(s) of ${conversationId} (round ${round + 1})`,
      );
    }
  }

  private async loadUnsummarized(
    conversationId: string,
    summarizedUntil: Date | null,
  ): Promise<SummarizableMessage[]> {
    const rows = await this.prisma.message.findMany({
      where: {
        conversationId,
        ...CONTEXT_MESSAGE_FILTER,
        ...(summarizedUntil && { createdAt: { gt: summarizedUntil } }),
      },
      orderBy: { createdAt: 'asc' },
      select: {
        role: true,
        content: true,
        createdAt: true,
        _count: { select: { attachments: true } },
      },
    });
    // The summarizer reads text only: images become a marker.
    return rows.map((r) => ({
      role: r.role as SummarizableMessage['role'],
      content: r._count.attachments
        ? withImagePlaceholder(r.content, r._count.attachments)
        : r.content,
      createdAt: r.createdAt,
    }));
  }
}
