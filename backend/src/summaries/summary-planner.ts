import {
  estimateMessageTokens,
  truncateToTokens,
} from '../context/token-estimator.js';

export interface SummarizableMessage {
  role: 'user' | 'assistant';
  content: string;
  createdAt: Date;
}

export interface SummaryPolicy {
  /** Summarize once the not-yet-summarized history passes this many tokens… */
  triggerTokens: number;
  /** …or this many messages (beyond the history cap, older ones are invisible). */
  triggerMessages: number;
  /** Newest messages left out of the summary: they keep going as history. */
  keepTokens: number;
  keepMinMessages: number;
  /** Conversation text sent per summarization call (it must fit the window too). */
  chunkTokens: number;
  /** A single huge message is cut to this before being summarized. */
  maxMessageTokens: number;
}

/**
 * Which messages should be folded into the summary now.
 *
 * Nothing happens while the recent history still fits comfortably. Once it
 * grows past the trigger, everything except the newest `keepTokens` worth of
 * messages is selected, so after summarizing, the history sent to the model
 * is short again and the summary carries the rest.
 */
export function selectMessagesToSummarize(
  messages: SummarizableMessage[],
  policy: SummaryPolicy,
): SummarizableMessage[] {
  if (messages.length <= policy.keepMinMessages) return [];

  const total = messages.reduce(
    (sum, m) => sum + estimateMessageTokens(m.content),
    0,
  );
  if (
    total <= policy.triggerTokens &&
    messages.length <= policy.triggerMessages
  ) {
    return [];
  }

  // Walk back from the newest message, keeping at least keepMinMessages.
  let keep = 0;
  let keptTokens = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const cost = estimateMessageTokens(messages[i].content);
    if (
      keep >= policy.keepMinMessages &&
      keptTokens + cost > policy.keepTokens
    ) {
      break;
    }
    keep++;
    keptTokens += cost;
  }
  // Never keep so many that the count trigger fires again right away.
  keep = Math.min(
    keep,
    Math.max(policy.keepMinMessages, policy.triggerMessages - 1),
  );

  return messages.slice(0, messages.length - keep);
}

/**
 * The oldest messages that fit in one summarization call. Always takes at
 * least one (truncated if needed), so progress is guaranteed.
 */
export function takeSummaryChunk(
  messages: SummarizableMessage[],
  policy: SummaryPolicy,
): SummarizableMessage[] {
  const chunk: SummarizableMessage[] = [];
  let used = 0;

  for (const message of messages) {
    const content = truncateToTokens(message.content, policy.maxMessageTokens);
    const cost = estimateMessageTokens(content);
    if (chunk.length > 0 && used + cost > policy.chunkTokens) break;
    chunk.push({ ...message, content });
    used += cost;
  }
  return chunk;
}
