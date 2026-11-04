import type { ChatRole } from '../llm/llm.types.js';
import { MEMORY_SECTION_HEADER } from '../memory/memory.prompt.js';
import {
  estimateMessageTokens,
  PROMPT_OVERHEAD_TOKENS,
} from './token-estimator.js';

export interface ContextLimits {
  /** Model window (num_ctx), e.g. 4096. */
  contextWindow: number;
  /** Reserved for the answer; never available to the prompt. */
  maxOutputTokens: number;
  /** Hard cap on previous messages, applied before the token budget. */
  maxHistoryMessages: number;
  /** Extra slack for estimation error, as a fraction of the window. */
  safetyMarginRatio: number;
  /** Fixed quota for retrieved memories (RAG), within the prompt budget. */
  memoryMaxTokens: number;
}

/** An attached image, by reference: the builder only needs its cost. */
export interface ImageRef {
  id: string;
  tokens: number;
}

export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
  images?: ImageRef[];
}

/** A message of the plan; images are ids, loaded from disk by the caller. */
export interface PlannedMessage {
  role: ChatRole;
  content: string;
  imageIds?: string[];
}

export interface BuildContextInput {
  systemPrompt: string;
  /** Previous messages, oldest first. */
  history: HistoryMessage[];
  /** The message being sent now. */
  userMessage: string;
  /**
   * Answer reserve for this request, overriding the default. Thinking mode
   * needs a bigger one (reasoning tokens count as output), which leaves less
   * room for history in that request. The window itself never changes.
   */
  maxOutputTokens?: number;
  /** Summary of the messages older than `history` (Phase 2). */
  summary?: string | null;
  /** Images attached to the message being sent (mandatory, like its text). */
  userImages?: ImageRef[];
  /** False when the model can't see images: history images become text. */
  visionEnabled?: boolean;
  /** Retrieved memories (Phase 5), already formatted, most relevant first. */
  memories?: string[];
}

export interface ContextPlan {
  /** Exactly what will be sent to the model. */
  messages: PlannedMessage[];
  estimatedPromptTokens: number;
  inputBudget: number;
  includedHistory: number;
  droppedHistory: number;
  summaryUsed: boolean;
  /** Images sent in this request (current message + history). */
  imagesSent: number;
  /** How many of the given memories fit (the first N). */
  memoriesUsed: number;
}

/**
 * What replaces an image in history when it isn't re-sent: the model still
 * knows something was shown there, instead of seeing a reply out of context.
 */
export function withImagePlaceholder(content: string, count: number): string {
  const note =
    count === 1
      ? '[o usuário enviou uma imagem aqui]'
      : `[o usuário enviou ${count} imagens aqui]`;
  return content ? `${content}\n\n${note}` : note;
}

const imagesCost = (images: ImageRef[] = []) =>
  images.reduce((sum, image) => sum + image.tokens, 0);

/**
 * The summary rides inside the system message instead of being a second
 * system message: chat templates like Qwen's only expect one, at the top.
 */
export function composeSystemPrompt(
  systemPrompt: string,
  summary?: string | null,
  memories: string[] = [],
): string {
  const sections = [
    systemPrompt,
    summary &&
      'Resumo da conversa até aqui (mensagens anteriores que não aparecem abaixo):\n' +
        summary,
    memories.length > 0 && `${MEMORY_SECTION_HEADER}\n${memories.join('\n')}`,
  ];
  return sections.filter(Boolean).join('\n\n');
}

export class ContextOverflowError extends Error {
  constructor(
    readonly requiredTokens: number,
    readonly budget: number,
  ) {
    super(
      `Message needs ~${requiredTokens} tokens but the prompt budget is ${budget}`,
    );
    this.name = 'ContextOverflowError';
  }
}

/**
 * Decides what goes into each model request so it always fits the window.
 *
 *   window (4096) = answer reserve + safety margin + input budget
 *
 * The input budget is filled in priority order:
 *   1. system prompt            (mandatory)
 *   2. current user message     (mandatory; if 1+2 don't fit -> error)
 *   3. summary of old messages  (inside the system message; dropped first
 *                                if 1+2+3 don't fit)
 *   4. retrieved memories       (inside the system message, most relevant
 *                                first, up to a fixed token quota)
 *   5. previous messages, newest first, until the budget or the cap runs out
 *
 * History is kept contiguous: once a message doesn't fit, everything older
 * is dropped too, so the model never sees a conversation with holes.
 *
 * Images (Phase 4) cost hundreds of tokens each, so only the most recent
 * history message with images re-sends them (that's what follow-up
 * questions refer to); older ones keep a text placeholder.
 *
 * Pure class (no I/O, no Nest): trivially unit-testable.
 */
export class ContextBuilder {
  /** Prompt budget with the default answer reserve. */
  readonly inputBudget: number;

  constructor(private readonly limits: ContextLimits) {
    this.inputBudget = this.inputBudgetFor(limits.maxOutputTokens);
    if (this.inputBudget <= 0) {
      throw new Error(
        'Context window too small for the configured output reserve and margin',
      );
    }
  }

  /** window - answer reserve - safety margin. */
  inputBudgetFor(maxOutputTokens: number): number {
    return (
      this.limits.contextWindow -
      maxOutputTokens -
      Math.ceil(this.limits.contextWindow * this.limits.safetyMarginRatio)
    );
  }

  build({
    systemPrompt,
    history,
    userMessage,
    maxOutputTokens = this.limits.maxOutputTokens,
    summary,
    userImages = [],
    visionEnabled = true,
    memories = [],
  }: BuildContextInput): ContextPlan {
    const budget = this.inputBudgetFor(maxOutputTokens);
    const userCost =
      estimateMessageTokens(userMessage) +
      imagesCost(userImages) +
      PROMPT_OVERHEAD_TOKENS;
    const systemCost = (text: string) =>
      text ? estimateMessageTokens(text) : 0;

    const required = systemCost(systemPrompt) + userCost;
    if (required > budget) {
      throw new ContextOverflowError(required, Math.max(0, budget));
    }
    const fits = (text: string) => systemCost(text) + userCost <= budget;

    // Summary if it fits next to the mandatory parts.
    const summaryUsed =
      Boolean(summary) && fits(composeSystemPrompt(systemPrompt, summary));
    const keptSummary = summaryUsed ? summary : null;

    // Memories one by one, while within their quota and the budget. Costs
    // are measured on the composed text, so the estimate stays exact.
    const withoutMemories = systemCost(
      composeSystemPrompt(systemPrompt, keptSummary),
    );
    const keptMemories: string[] = [];
    for (const memory of memories) {
      const candidate = composeSystemPrompt(systemPrompt, keptSummary, [
        ...keptMemories,
        memory,
      ]);
      const memoryCost = systemCost(candidate) - withoutMemories;
      if (memoryCost > this.limits.memoryMaxTokens || !fits(candidate)) break;
      keptMemories.push(memory);
    }

    const system = composeSystemPrompt(systemPrompt, keptSummary, keptMemories);
    const mandatory = systemCost(system) + userCost;

    const cap = Math.max(0, this.limits.maxHistoryMessages);
    const candidates = cap === 0 ? [] : history.slice(-cap);

    let used = mandatory;
    let imagesSent = userImages.length;
    let historyImagesDecided = false;
    const selected: PlannedMessage[] = [];

    for (let i = candidates.length - 1; i >= 0; i--) {
      const { role, content, images = [] } = candidates[i];
      let planned: PlannedMessage | null = null;
      let cost = 0;

      // The newest message with images gets them back, if they fit.
      if (images.length > 0 && !historyImagesDecided) {
        historyImagesDecided = true;
        const withImages = estimateMessageTokens(content) + imagesCost(images);
        if (visionEnabled && used + withImages <= budget) {
          planned = { role, content, imageIds: images.map((img) => img.id) };
          cost = withImages;
          imagesSent += images.length;
        }
      }
      if (!planned) {
        const text = images.length
          ? withImagePlaceholder(content, images.length)
          : content;
        planned = { role, content: text };
        cost = estimateMessageTokens(text);
      }

      if (used + cost > budget) break;
      used += cost;
      selected.unshift(planned);
    }

    const messages: PlannedMessage[] = [
      ...(system ? [{ role: 'system' as const, content: system }] : []),
      ...selected,
      {
        role: 'user',
        content: userMessage,
        ...(userImages.length > 0 && {
          imageIds: userImages.map((img) => img.id),
        }),
      },
    ];

    return {
      messages,
      estimatedPromptTokens: used,
      inputBudget: budget,
      includedHistory: selected.length,
      droppedHistory: history.length - selected.length,
      summaryUsed,
      imagesSent,
      memoriesUsed: keptMemories.length,
    };
  }
}
