import {
  BadRequestException,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AttachmentsService } from '../attachments/attachments.service.js';
import { BackgroundJobsService } from '../background/background-jobs.service.js';
import { EnvironmentVariables } from '../config/env.validation.js';
import {
  ContextBuilder,
  ContextOverflowError,
  type ContextPlan,
  type HistoryMessage,
  type ImageRef,
  type PlannedMessage,
} from '../context/context-builder.js';
import { CONTEXT_MESSAGE_FILTER } from '../conversations/context-messages.js';
import { toMessageDto } from '../conversations/conversation.dto.js';
import { ConversationsService } from '../conversations/conversations.service.js';
import type { Attachment, Message } from '../generated/prisma/client.js';
import { LlmError } from '../llm/llm.errors.js';
import { LlmService } from '../llm/llm.service.js';
import {
  LlmPriority,
  type ChatMessage,
  type ChatRequest,
} from '../llm/llm.types.js';
import { formatMemory, type MemoryRef } from '../memory/memory.prompt.js';
import { MemoryService } from '../memory/memory.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  DEFAULT_SYSTEM_PROMPT,
  resolveChatSettings,
  type SettingsDefaults,
} from './chat-settings.js';
import type { SendMessageDto } from './send-message.dto.js';
import type { SseStream } from './sse-stream.js';

export interface PreparedChat {
  conversationId: string;
  plan: ContextPlan;
  request: ChatRequest;
  userMessage: Message & { attachments: Attachment[] };
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
    private readonly jobs: BackgroundJobsService,
    private readonly attachments: AttachmentsService,
    private readonly memory: MemoryService,
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
   * so these failures are plain HTTP errors (400, 404, 413, 503).
   */
  async prepare(
    conversationId: string,
    dto: SendMessageDto,
  ): Promise<PreparedChat> {
    const conversation = await this.conversations.getOrThrow(conversationId);

    if (!this.llm.hasCapacity()) {
      throw new ServiceUnavailableException({
        code: 'queue_full',
        message: 'LLM queue is full',
      });
    }

    const attachmentIds = dto.attachmentIds ?? [];
    if (!dto.content.trim() && attachmentIds.length === 0) {
      throw new BadRequestException({
        code: 'empty_message',
        message: 'Send some text or at least one image',
      });
    }
    const uploads = await this.attachments.findUnlinked(attachmentIds);

    // Conversation settings (null = default) + this message's thinking
    // toggle. Thinking gets a bigger output reserve, so less history.
    const model = conversation.model ?? this.env.LLM_DEFAULT_MODEL;
    const capabilities =
      (await this.llm.findModel(model))?.capabilities ?? null;
    if (uploads.length > 0 && capabilities && !capabilities.vision) {
      throw new BadRequestException({
        code: 'model_without_vision',
        message: `Model "${model}" cannot see images`,
      });
    }
    const settings = resolveChatSettings(
      conversation,
      this.defaults(),
      dto.think ?? false,
      capabilities,
    );

    // Long-term memory: one embedding (queued, CPU instance) + a vector
    // search. Returns [] on any failure, so the chat never depends on it.
    const hits = conversation.memoryEnabled
      ? await this.memory.search(dto.content, {
          conversationId,
          summarizedUntil: conversation.summarizedUntil,
        })
      : [];

    // Messages already folded into the summary are not sent again as history.
    const plan = this.buildPlan({
      history: await this.loadHistory(
        conversationId,
        conversation.summarizedUntil,
      ),
      dto,
      systemPrompt: settings.systemPrompt,
      maxOutputTokens: settings.maxOutputTokens,
      summary: conversation.summary,
      userImages: uploads.map((u) => this.imageRef(u)),
      visionEnabled: capabilities?.vision ?? true,
      memories: hits.map(formatMemory),
    });
    // The context keeps the most relevant ones that fit its quota.
    const memoryRefs: MemoryRef[] = hits
      .slice(0, plan.memoriesUsed)
      .map(({ conversationId, conversationTitle, similarity }) => ({
        conversationId,
        conversationTitle,
        similarity,
      }));

    // One transaction: the user message, its images, and the placeholder
    // answer. Explicit timestamps keep user -> assistant ordering stable.
    const now = Date.now();
    const { userMessage, assistantMessage } = await this.prisma.$transaction(
      async (tx) => {
        const user = await tx.message.create({
          data: {
            conversationId,
            role: 'user',
            content: dto.content,
            createdAt: new Date(now),
          },
        });
        if (attachmentIds.length > 0) {
          const { count } = await tx.attachment.updateMany({
            where: { id: { in: attachmentIds }, messageId: null },
            data: { messageId: user.id },
          });
          // Someone else linked them meanwhile: undo everything.
          if (count !== attachmentIds.length) {
            throw new BadRequestException({
              code: 'invalid_attachments',
              message: 'Some attachments were already sent',
            });
          }
        }
        const assistant = await tx.message.create({
          data: {
            conversationId,
            role: 'assistant',
            content: '',
            status: 'streaming',
            createdAt: new Date(now + 1),
            ...(memoryRefs.length > 0 && { memories: memoryRefs }),
          },
        });
        return {
          userMessage: { ...user, attachments: uploads },
          assistantMessage: assistant,
        };
      },
    );
    await this.conversations.touch(conversationId);

    return {
      conversationId,
      plan,
      userMessage,
      assistantMessage,
      request: {
        model: settings.model,
        messages: await this.withImages(plan.messages),
        think: settings.think,
        maxOutputTokens: settings.maxOutputTokens,
        temperature: settings.temperature,
      },
    };
  }

  defaults(): SettingsDefaults {
    return {
      model: this.env.LLM_DEFAULT_MODEL,
      systemPrompt: DEFAULT_SYSTEM_PROMPT,
      maxOutputTokens: this.env.LLM_MAX_OUTPUT_TOKENS,
      maxOutputTokensThinking: this.env.LLM_MAX_OUTPUT_TOKENS_THINKING,
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
        summaryUsed: plan.summaryUsed,
        imagesSent: plan.imagesSent,
        memoriesUsed: plan.memoriesUsed,
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

      // Title and summary run afterwards, in the background, at low priority.
      this.jobs.afterExchange(prepared.conversationId);
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

  /** Newest messages after the summary boundary, oldest first. */
  /** Turns the plan's image ids into base64, one file at a time. */
  private async withImages(messages: PlannedMessage[]): Promise<ChatMessage[]> {
    const result: ChatMessage[] = [];
    for (const { imageIds, ...message } of messages) {
      result.push(
        imageIds?.length
          ? { ...message, images: await this.attachments.readBase64(imageIds) }
          : message,
      );
    }
    return result;
  }

  private imageRef(
    attachment: Pick<Attachment, 'id' | 'width' | 'height'>,
  ): ImageRef {
    return { id: attachment.id, tokens: this.attachments.tokensOf(attachment) };
  }

  private async loadHistory(
    conversationId: string,
    summarizedUntil: Date | null,
  ): Promise<HistoryMessage[]> {
    const recent = await this.prisma.message.findMany({
      where: {
        conversationId,
        ...CONTEXT_MESSAGE_FILTER,
        ...(summarizedUntil && { createdAt: { gt: summarizedUntil } }),
      },
      orderBy: { createdAt: 'desc' },
      // The builder caps history anyway; no need to read more rows than that.
      take: this.env.CONTEXT_MAX_HISTORY_MESSAGES,
      select: {
        role: true,
        content: true,
        attachments: {
          orderBy: { createdAt: 'asc' },
          select: { id: true, width: true, height: true },
        },
      },
    });
    return recent.reverse().map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
      images: m.attachments.map((a) => this.imageRef(a)),
    }));
  }

  private buildPlan({
    dto,
    ...input
  }: {
    history: HistoryMessage[];
    dto: SendMessageDto;
    systemPrompt: string;
    maxOutputTokens: number;
    summary: string | null;
    userImages: ImageRef[];
    visionEnabled: boolean;
    memories: string[];
  }): ContextPlan {
    try {
      return this.context.build({ ...input, userMessage: dto.content });
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
