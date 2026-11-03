import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { EnvironmentVariables } from '../config/env.validation.js';
import {
  ContextBuilder,
  ContextOverflowError,
  type ContextPlan,
} from '../context/context-builder.js';
import { toMessageDto } from '../conversations/conversation.dto.js';
import { ConversationsService } from '../conversations/conversations.service.js';
import type { Message } from '../generated/prisma/client.js';
import { LlmError } from '../llm/llm.errors.js';
import { LlmService } from '../llm/llm.service.js';
import { LlmPriority, type ChatRequest } from '../llm/llm.types.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { SendMessageDto } from './send-message.dto.js';
import type { SseStream } from './sse-stream.js';

/** Kept short on purpose: every token here is taken from the history budget. */
const DEFAULT_SYSTEM_PROMPT =
  'Você é um assistente prestativo rodando localmente. Responda em português ' +
  'do Brasil, de forma clara e direta. Use markdown quando ajudar: listas, ' +
  'tabelas e blocos de código com a linguagem indicada.';

export interface PreparedChat {
  conversationId: string;
  plan: ContextPlan;
  request: ChatRequest;
  userMessage: Message;
  assistantMessage: Message;
}

@Injectable()
export class ChatService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly conversations: ConversationsService,
    private readonly context: ContextBuilder,
    private readonly llm: LlmService,
    private readonly env: EnvironmentVariables,
  ) {}

  /** A crash mid-stream leaves `streaming` rows behind; they can't resume. */
  async onApplicationBootstrap(): Promise<void> {
    const { count } = await this.prisma.message.updateMany({
      where: { status: 'streaming' },
      data: { status: 'error' },
    });
    if (count)
      this.logger.warn(`Marked ${count} interrupted message(s) as error`);
  }

  /**
   * Everything that can fail fast happens here, before any streaming starts,
   * so these failures are plain HTTP errors (404, 413, 503).
   */
  async prepare(
    conversationId: string,
    dto: SendMessageDto,
  ): Promise<PreparedChat> {
    await this.conversations.getOrThrow(conversationId);

    if (!this.llm.hasCapacity()) {
      throw new ServiceUnavailableException({
        code: 'queue_full',
        message: 'LLM queue is full',
      });
    }

    const think = dto.think ?? false;
    // Reasoning tokens count as output, so thinking gets a bigger reserve
    // (and, in exchange, less history in this one request).
    const maxOutputTokens = think
      ? this.env.LLM_MAX_OUTPUT_TOKENS_THINKING
      : this.env.LLM_MAX_OUTPUT_TOKENS;
    const plan = this.buildPlan(
      await this.loadHistory(conversationId),
      dto,
      maxOutputTokens,
    );

    // Explicit timestamps keep user -> assistant ordering stable.
    const now = Date.now();
    const [userMessage, assistantMessage] = await this.prisma.$transaction([
      this.prisma.message.create({
        data: {
          conversationId,
          role: 'user',
          content: dto.content,
          createdAt: new Date(now),
        },
      }),
      this.prisma.message.create({
        data: {
          conversationId,
          role: 'assistant',
          content: '',
          status: 'streaming',
          createdAt: new Date(now + 1),
        },
      }),
    ]);
    await this.conversations.touch(conversationId);

    return {
      conversationId,
      plan,
      userMessage,
      assistantMessage,
      request: {
        model: this.env.LLM_DEFAULT_MODEL,
        messages: plan.messages,
        think,
        maxOutputTokens,
      },
    };
  }

  /** Runs the model call (through the queue) and relays it as SSE events. */
  async stream(
    prepared: PreparedChat,
    sse: SseStream,
    signal: AbortSignal,
  ): Promise<void> {
    const { plan, request, assistantMessage } = prepared;
    let content = '';
    let thinking = '';

    sse.send('start', {
      userMessage: toMessageDto(prepared.userMessage),
      assistantMessageId: assistantMessage.id,
      context: {
        includedHistory: plan.includedHistory,
        droppedHistory: plan.droppedHistory,
        estimatedPromptTokens: plan.estimatedPromptTokens,
        inputBudget: plan.inputBudget,
      },
    });

    try {
      const result = await this.llm.chat(request, {
        priority: LlmPriority.Chat,
        signal,
        onQueued: (position) => sse.send('queued', { position }),
        onStart: ({ modelLoaded }) => sse.send('generating', { modelLoaded }),
        onChunk: (chunk) => {
          if (chunk.type === 'thinking') thinking += chunk.text;
          else content += chunk.text;
          sse.send(chunk.type, { text: chunk.text });
        },
      });

      const saved = await this.prisma.message.update({
        where: { id: assistantMessage.id },
        data: {
          content,
          thinking: thinking || null,
          status: 'complete',
          // eval_count includes reasoning tokens, so it only describes the
          // stored content when thinking was off.
          tokenCount: thinking ? null : result.completionTokens,
        },
      });

      this.logger.log(
        `Prompt tokens: estimated ${plan.estimatedPromptTokens}, ` +
          `real ${result.promptTokens ?? '?'} | output ${result.completionTokens ?? '?'} ` +
          `(${result.doneReason}) in ${result.totalDurationMs ?? '?'} ms`,
      );

      sse.send('done', {
        message: toMessageDto(saved),
        doneReason: result.doneReason,
        usage: {
          estimatedPromptTokens: plan.estimatedPromptTokens,
          promptTokens: result.promptTokens,
          completionTokens: result.completionTokens,
          loadDurationMs: result.loadDurationMs,
          totalDurationMs: result.totalDurationMs,
        },
      });
    } catch (error) {
      const llmError =
        error instanceof LlmError
          ? error
          : new LlmError('model_error', (error as Error).message);
      if (llmError.code !== 'aborted') this.logger.warn(llmError.message);

      // Keep whatever was generated: the user saw it on screen.
      const saved = await this.prisma.message.update({
        where: { id: assistantMessage.id },
        data: {
          content,
          thinking: thinking || null,
          status: llmError.code === 'aborted' ? 'aborted' : 'error',
        },
      });

      sse.send('error', {
        code: llmError.code,
        message: llmError.message,
        assistantMessage: toMessageDto(saved),
      });
    }
  }

  /**
   * Only what the model should see: user messages and complete answers.
   * Failed or aborted answers are not fed back as if they were real replies.
   */
  private async loadHistory(conversationId: string) {
    const recent = await this.prisma.message.findMany({
      where: {
        conversationId,
        OR: [{ role: 'user' }, { role: 'assistant', status: 'complete' }],
      },
      orderBy: { createdAt: 'desc' },
      // The builder caps history anyway; no need to read more rows than that.
      take: this.env.CONTEXT_MAX_HISTORY_MESSAGES,
      select: { role: true, content: true },
    });
    return recent.reverse().map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));
  }

  private buildPlan(
    history: { role: 'user' | 'assistant'; content: string }[],
    dto: SendMessageDto,
    maxOutputTokens: number,
  ): ContextPlan {
    try {
      return this.context.build({
        systemPrompt: DEFAULT_SYSTEM_PROMPT,
        history,
        userMessage: dto.content,
        maxOutputTokens,
      });
    } catch (error) {
      if (error instanceof ContextOverflowError) {
        throw new PayloadTooLargeException({
          code: 'context_overflow',
          message: error.message,
          requiredTokens: error.requiredTokens,
          budget: error.budget,
        });
      }
      throw error;
    }
  }
}
