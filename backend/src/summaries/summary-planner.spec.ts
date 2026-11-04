import {
  CHARS_PER_TOKEN,
  estimateMessageTokens,
  MESSAGE_OVERHEAD_TOKENS,
} from '../context/token-estimator.js';
import {
  selectMessagesToSummarize,
  takeSummaryChunk,
  type SummarizableMessage,
  type SummaryPolicy,
} from './summary-planner.js';

const policy: SummaryPolicy = {
  triggerTokens: 1600,
  triggerMessages: 20,
  keepTokens: 800,
  keepMinMessages: 2,
  chunkTokens: 2000,
  maxMessageTokens: 700,
};

/** `count` messages costing exactly `tokens` each, one second apart. */
const messages = (count: number, tokens: number): SummarizableMessage[] =>
  Array.from({ length: count }, (_, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: String(i % 10).repeat(
      (tokens - MESSAGE_OVERHEAD_TOKENS) * CHARS_PER_TOKEN,
    ),
    createdAt: new Date(2026, 0, 1, 0, 0, i),
  }));

const tokensOf = (list: SummarizableMessage[]) =>
  list.reduce((sum, m) => sum + estimateMessageTokens(m.content), 0);

describe('selectMessagesToSummarize', () => {
  it('does nothing while the history is small', () => {
    expect(selectMessagesToSummarize(messages(6, 200), policy)).toEqual([]);
  });

  it('summarizes the oldest messages once the token trigger is passed', () => {
    const list = messages(10, 200); // 2000 tokens > 1600
    const selected = selectMessagesToSummarize(list, policy);

    // Keeps the newest 800 tokens (4 messages) as raw history.
    expect(selected).toEqual(list.slice(0, 6));
    expect(tokensOf(list.slice(6))).toBeLessThanOrEqual(policy.keepTokens);
  });

  it('also triggers on message count, even if they are short', () => {
    const list = messages(25, 20); // 500 tokens, but 25 > 20 messages
    const selected = selectMessagesToSummarize(list, policy);

    expect(selected.length).toBeGreaterThan(0);
    // What stays must not immediately re-trigger by count.
    expect(list.length - selected.length).toBeLessThan(policy.triggerMessages);
  });

  it('always keeps at least the last exchange, even if it is huge', () => {
    const list = messages(4, 1000);
    const selected = selectMessagesToSummarize(list, policy);

    expect(selected).toEqual(list.slice(0, 2));
  });

  it('never selects anything with only the minimum messages', () => {
    expect(selectMessagesToSummarize(messages(2, 2000), policy)).toEqual([]);
  });
});

describe('takeSummaryChunk', () => {
  it('takes the oldest messages that fit in one call, in order', () => {
    const list = messages(10, 300);
    const chunk = takeSummaryChunk(list, policy);

    expect(chunk).toHaveLength(6); // 6 x 300 = 1800 <= 2000
    expect(chunk.map((m) => m.createdAt)).toEqual(
      list.slice(0, 6).map((m) => m.createdAt),
    );
  });

  it('truncates a huge message so progress is always possible', () => {
    const [huge] = messages(1, 5000);
    const chunk = takeSummaryChunk([huge], policy);

    expect(chunk).toHaveLength(1);
    expect(estimateMessageTokens(chunk[0].content)).toBeLessThanOrEqual(
      policy.maxMessageTokens + MESSAGE_OVERHEAD_TOKENS + 1,
    );
    expect(chunk[0].content.endsWith('…')).toBe(true);
    expect(chunk[0].createdAt).toEqual(huge.createdAt);
  });
});
