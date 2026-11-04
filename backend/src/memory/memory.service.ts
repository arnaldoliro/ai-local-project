import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { EnvironmentVariables } from '../config/env.validation.js';
import { withImagePlaceholder } from '../context/context-builder.js';
import type { Message } from '../generated/prisma/client.js';
import { LlmError } from '../llm/llm.errors.js';
import { LlmService } from '../llm/llm.service.js';
import { LlmPriority } from '../llm/llm.types.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { buildExchangeText, chunkText } from './chunker.js';
import { embeddingQuery, type MemoryHit } from './memory.prompt.js';

/** Size of the `vector(1024)` column: the model must produce this. */
export const EMBEDDING_DIMENSIONS = 1024;
/** Candidates fetched per question; the context quota keeps fewer. */
const TOP_K = 4;
/**
 * Below this, a chunk is noise. Measured with qwen3-embedding:0.6b on
 * Portuguese: related ~0.65, unrelated ~0.23-0.28.
 */
const MIN_SIMILARITY = 0.45;
/** Old conversations are indexed only while the model queue is idle. */
const BACKFILL_EVERY_MS = 10 * 60 * 1000;
const BACKFILL_FIRST_DELAY_MS = 60 * 1000;
const BACKFILL_BATCH = 20;
const INDEX_BATCH_PER_CONVERSATION = 10;

interface HitRow {
  conversation_id: string;
  title: string | null;
  content: string;
  message_created_at: Date;
  similarity: number;
}

/**
 * Long-term memory (RAG): every completed exchange is split into chunks,
 * embedded on the CPU-only Ollama, stored in pgvector, and searched by
 * cosine similarity when a new message arrives.
 *
 * Machine protection: every embedding is one queued call (no batching in
 * parallel), the backfill only runs when nothing else is waiting, and the
 * search degrades to "no memories" instead of failing the chat.
 */
@Injectable()
export class MemoryService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(MemoryService.name);
  private readonly shutdown = new AbortController();
  private timers: NodeJS.Timeout[] = [];
  private backfillRunning = false;
  private warnedUnavailable = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
    private readonly env: EnvironmentVariables,
  ) {}

  onApplicationBootstrap(): void {
    const first = setTimeout(
      () => void this.backfill(),
      BACKFILL_FIRST_DELAY_MS,
    );
    const every = setInterval(() => void this.backfill(), BACKFILL_EVERY_MS);
    first.unref();
    every.unref();
    this.timers = [first, every];
  }

  onModuleDestroy(): void {
    this.timers.forEach((t) => clearTimeout(t));
    this.shutdown.abort();
  }

  /**
   * Chunks most similar to `query`, from conversations with memory on.
   * The current conversation's recent part (after its summary boundary)
   * is excluded: it is already in the prompt as history.
   * Never throws: without memories the chat still works.
   */
  async search(
    query: string,
    current: { conversationId: string; summarizedUntil: Date | null },
    signal?: AbortSignal,
  ): Promise<MemoryHit[]> {
    if (!query.trim()) return [];
    try {
      const [vector] = await this.llm.embed([embeddingQuery(query)], {
        priority: LlmPriority.Chat,
        signal,
      });
      const literal = toVectorLiteral(vector);
      // Messages of the current conversation newer than this are history.
      const cutoff = current.summarizedUntil ?? new Date(0);

      const rows = await this.prisma.$queryRaw<HitRow[]>`
        SELECT mc.conversation_id, c.title, mc.content,
               m.created_at AS message_created_at,
               1 - (mc.embedding <=> ${literal}::vector) AS similarity
        FROM memory_chunks mc
        JOIN conversations c ON c.id = mc.conversation_id
        JOIN messages m ON m.id = mc.message_id
        WHERE c.memory_enabled
          AND mc.model = ${this.env.EMBEDDING_MODEL}
          AND NOT (mc.conversation_id = ${current.conversationId}::uuid
                   AND m.created_at > ${cutoff})
        ORDER BY mc.embedding <=> ${literal}::vector
        LIMIT ${TOP_K}`;

      this.warnedUnavailable = false; // working again: warn on the next failure
      return rows
        .filter((r) => r.similarity >= MIN_SIMILARITY)
        .map((r) => ({
          conversationId: r.conversation_id,
          conversationTitle: r.title,
          date: r.message_created_at,
          content: r.content,
          similarity: Math.round(r.similarity * 1000) / 1000,
        }));
    } catch (error) {
      this.warnOnce(error);
      return [];
    }
  }

  /** Indexes the not-yet-indexed exchanges of one conversation. */
  async indexConversation(
    conversationId: string,
    signal: AbortSignal,
  ): Promise<void> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { memoryEnabled: true },
    });
    if (!conversation?.memoryEnabled) return;

    const pending = await this.prisma.message.findMany({
      where: {
        conversationId,
        role: 'assistant',
        status: 'complete',
        embeddedAt: null,
      },
      orderBy: { createdAt: 'asc' },
      take: INDEX_BATCH_PER_CONVERSATION,
    });
    for (const answer of pending) {
      if (signal.aborted) return;
      await this.indexExchange(answer, signal);
    }
  }

  /**
   * One exchange = the answer + the user message right before it. Each
   * chunk is embedded in its own queued call, one after another.
   */
  private async indexExchange(
    answer: Message,
    signal: AbortSignal,
  ): Promise<void> {
    const question = await this.prisma.message.findFirst({
      where: {
        conversationId: answer.conversationId,
        role: 'user',
        createdAt: { lt: answer.createdAt },
      },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { attachments: true } } },
    });
    const userText = question?._count.attachments
      ? withImagePlaceholder(question.content, question._count.attachments)
      : (question?.content ?? '');
    const chunks = chunkText(buildExchangeText(userText, answer.content));

    const vectors: number[][] = [];
    for (const chunk of chunks) {
      const [vector] = await this.llm.embed([chunk], {
        priority: LlmPriority.Embedding,
        signal,
      });
      if (vector.length !== EMBEDDING_DIMENSIONS) {
        throw new LlmError(
          'model_error',
          `${this.env.EMBEDDING_MODEL} returned ${vector.length} dimensions, expected ${EMBEDDING_DIMENSIONS}`,
        );
      }
      vectors.push(vector);
    }

    // Idempotent: re-indexing an exchange replaces its chunks.
    await this.prisma.$transaction([
      this.prisma.memoryChunk.deleteMany({ where: { messageId: answer.id } }),
      ...chunks.map(
        (content, i) => this.prisma.$executeRaw`
          INSERT INTO memory_chunks (id, conversation_id, message_id, content, embedding, model)
          VALUES (${randomUUID()}::uuid, ${answer.conversationId}::uuid, ${answer.id}::uuid,
                  ${content}, ${toVectorLiteral(vectors[i])}::vector, ${this.env.EMBEDDING_MODEL})`,
      ),
      this.prisma.message.update({
        where: { id: answer.id },
        data: { embeddedAt: new Date() },
      }),
    ]);
  }

  /**
   * Indexes older conversations a little at a time, and only when the
   * model queue is idle, so it never competes with the user.
   */
  private async backfill(): Promise<void> {
    if (this.backfillRunning || !this.llm.isIdle()) return;
    if (!(await this.llm.hasEmbeddingModel())) return;
    this.backfillRunning = true;
    let indexed = 0;
    try {
      const pending = await this.prisma.message.findMany({
        where: {
          role: 'assistant',
          status: 'complete',
          embeddedAt: null,
          conversation: { memoryEnabled: true },
        },
        orderBy: { createdAt: 'asc' },
        take: BACKFILL_BATCH,
      });
      for (const answer of pending) {
        // Someone started chatting: stop and leave the rest for later.
        if (this.shutdown.signal.aborted || !this.llm.isIdle()) break;
        await this.indexExchange(answer, this.shutdown.signal);
        indexed++;
      }
    } catch (error) {
      this.warnOnce(error);
    } finally {
      this.backfillRunning = false;
      if (indexed > 0)
        this.logger.log(`Backfill indexed ${indexed} exchange(s)`);
    }
  }

  private warnOnce(error: unknown): void {
    if (error instanceof LlmError && error.code === 'aborted') return;
    if (this.warnedUnavailable) return;
    this.warnedUnavailable = true;
    this.logger.warn(
      `Memory unavailable, chatting without it: ${(error as Error).message}`,
    );
  }
}

/** pgvector's text form, passed as a bound parameter and cast to ::vector. */
function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(',')}]`;
}
