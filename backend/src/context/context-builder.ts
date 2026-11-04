import type { ChatMessage } from '../llm/llm.types.js';
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
}

export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
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
}

export interface ContextPlan {
  /** Exactly what will be sent to the model. */
  messages: ChatMessage[];
  estimatedPromptTokens: number;
  inputBudget: number;
  includedHistory: number;
  droppedHistory: number;
  summaryUsed: boolean;
}

/**
 * The summary rides inside the system message instead of being a second
 * system message: chat templates like Qwen's only expect one, at the top.
 */
export function composeSystemPrompt(
  systemPrompt: string,
  summary?: string | null,
): string {
  if (!summary) return systemPrompt;
  const section =
    'Resumo da conversa até aqui (mensagens anteriores que não aparecem abaixo):\n' +
    summary;
  return systemPrompt ? `${systemPrompt}\n\n${section}` : section;
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
 *   4. previous messages, newest first, until the budget or the cap runs out
 *
 * History is kept contiguous: once a message doesn't fit, everything older
 * is dropped too, so the model never sees a conversation with holes.
 * Phase 5 adds RAG snippets.
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
  }: BuildContextInput): ContextPlan {
    const budget = this.inputBudgetFor(maxOutputTokens);
    const userCost =
      estimateMessageTokens(userMessage) + PROMPT_OVERHEAD_TOKENS;
    const systemCost = (text: string) =>
      text ? estimateMessageTokens(text) : 0;

    // Try with the summary; without it if the message is too big for both.
    let system = composeSystemPrompt(systemPrompt, summary);
    let summaryUsed = Boolean(summary);
    let mandatory = systemCost(system) + userCost;
    if (summaryUsed && mandatory > budget) {
      system = systemPrompt;
      summaryUsed = false;
      mandatory = systemCost(system) + userCost;
    }

    if (mandatory > budget) {
      throw new ContextOverflowError(mandatory, Math.max(0, budget));
    }

    const cap = Math.max(0, this.limits.maxHistoryMessages);
    const candidates = cap === 0 ? [] : history.slice(-cap);

    let used = mandatory;
    const selected: HistoryMessage[] = [];
    for (let i = candidates.length - 1; i >= 0; i--) {
      const cost = estimateMessageTokens(candidates[i].content);
      if (used + cost > budget) break;
      used += cost;
      selected.unshift(candidates[i]);
    }

    const messages: ChatMessage[] = [
      ...(system ? [{ role: 'system' as const, content: system }] : []),
      ...selected,
      { role: 'user', content: userMessage },
    ];

    return {
      messages,
      estimatedPromptTokens: used,
      inputBudget: budget,
      includedHistory: selected.length,
      droppedHistory: history.length - selected.length,
      summaryUsed,
    };
  }
}
