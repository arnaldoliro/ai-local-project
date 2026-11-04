import {
  composeSystemPrompt,
  ContextBuilder,
  ContextOverflowError,
  type ContextLimits,
  type HistoryMessage,
} from './context-builder.js';
import {
  CHARS_PER_TOKEN,
  estimateMessageTokens,
  estimateTextTokens,
  MESSAGE_OVERHEAD_TOKENS,
} from './token-estimator.js';

const limits: ContextLimits = {
  contextWindow: 4096,
  maxOutputTokens: 1024,
  maxHistoryMessages: 20,
  safetyMarginRatio: 0.1,
};

/** A message whose estimated cost is exactly `tokens` (overhead included). */
const sized = (tokens: number): string =>
  'x'.repeat((tokens - MESSAGE_OVERHEAD_TOKENS) * CHARS_PER_TOKEN);

const turns = (count: number, content = 'hello'): HistoryMessage[] =>
  Array.from({ length: count }, (_, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: `${content} ${i}`,
  }));

describe('token estimator', () => {
  it('returns 0 for empty text and rounds up otherwise', () => {
    expect(estimateTextTokens('')).toBe(0);
    expect(estimateTextTokens('a')).toBe(1);
    expect(estimateTextTokens('a'.repeat(CHARS_PER_TOKEN + 1))).toBe(2);
  });

  it('adds the chat-template overhead per message', () => {
    expect(estimateMessageTokens('')).toBe(MESSAGE_OVERHEAD_TOKENS);
  });
});

describe('ContextBuilder', () => {
  it('reserves the answer and a safety margin from the window', () => {
    // 4096 - 1024 - ceil(409.6)
    expect(new ContextBuilder(limits).inputBudget).toBe(2662);
  });

  it('refuses limits that leave no room for the prompt', () => {
    expect(
      () => new ContextBuilder({ ...limits, maxOutputTokens: 4000 }),
    ).toThrow();
  });

  it('sends system prompt, full history and the new message in order', () => {
    const history = turns(4);
    const plan = new ContextBuilder(limits).build({
      systemPrompt: 'be nice',
      history,
      userMessage: 'new question',
    });

    expect(plan.messages).toEqual([
      { role: 'system', content: 'be nice' },
      ...history,
      { role: 'user', content: 'new question' },
    ]);
    expect(plan.includedHistory).toBe(4);
    expect(plan.droppedHistory).toBe(0);
  });

  it('omits the system message when the prompt is empty', () => {
    const plan = new ContextBuilder(limits).build({
      systemPrompt: '',
      history: [],
      userMessage: 'hi',
    });

    expect(plan.messages).toEqual([{ role: 'user', content: 'hi' }]);
  });

  it('drops the oldest messages first when the budget runs out', () => {
    // Each history message costs 1000 tokens: only 2 fit next to the rest.
    const history: HistoryMessage[] = [
      { role: 'user', content: sized(1000).slice(1) + 'A' },
      { role: 'assistant', content: sized(1000).slice(1) + 'B' },
      { role: 'user', content: sized(1000).slice(1) + 'C' },
    ];

    const plan = new ContextBuilder(limits).build({
      systemPrompt: '',
      history,
      userMessage: 'hi',
    });

    expect(plan.includedHistory).toBe(2);
    expect(plan.droppedHistory).toBe(1);
    expect(plan.messages.at(-3)?.content.endsWith('B')).toBe(true);
    expect(plan.messages.at(-2)?.content.endsWith('C')).toBe(true);
  });

  it('keeps history contiguous: a big message blocks older small ones', () => {
    const history: HistoryMessage[] = [
      { role: 'user', content: 'small and old' },
      { role: 'assistant', content: sized(3000) },
      { role: 'user', content: 'recent' },
    ];

    const plan = new ContextBuilder(limits).build({
      systemPrompt: '',
      history,
      userMessage: 'hi',
    });

    expect(plan.messages.map((m) => m.content)).toEqual(['recent', 'hi']);
  });

  it('never estimates more than the input budget', () => {
    // A high cap, so only the token budget limits the history.
    const plan = new ContextBuilder({
      ...limits,
      maxHistoryMessages: 1000,
    }).build({
      systemPrompt: 'system',
      history: turns(200, sized(100)),
      userMessage: 'hi',
    });

    expect(plan.estimatedPromptTokens).toBeLessThanOrEqual(plan.inputBudget);
    expect(plan.droppedHistory).toBeGreaterThan(0);
  });

  it('caps history to the last N messages even with budget left', () => {
    const history = turns(30);
    const plan = new ContextBuilder({ ...limits, maxHistoryMessages: 6 }).build(
      { systemPrompt: '', history, userMessage: 'hi' },
    );

    expect(plan.includedHistory).toBe(6);
    expect(plan.messages[0]).toEqual(history[24]);
  });

  it('sends no history when the cap is 0', () => {
    const plan = new ContextBuilder({ ...limits, maxHistoryMessages: 0 }).build(
      { systemPrompt: '', history: turns(4), userMessage: 'hi' },
    );

    expect(plan.messages).toEqual([{ role: 'user', content: 'hi' }]);
  });

  it('shrinks the prompt budget when a request reserves more output (thinking)', () => {
    // 6 messages of 300 tokens: all fit in 2662, only 5 fit in 1638.
    const history = turns(6, sized(300).slice(0, -3));
    const builder = new ContextBuilder(limits);

    const normal = builder.build({
      systemPrompt: '',
      history,
      userMessage: 'hi',
    });
    const thinking = builder.build({
      systemPrompt: '',
      history,
      userMessage: 'hi',
      maxOutputTokens: 2048,
    });

    expect(normal.inputBudget).toBe(2662);
    expect(thinking.inputBudget).toBe(1638); // 4096 - 2048 - 410
    expect(normal.includedHistory).toBe(6);
    expect(thinking.includedHistory).toBe(5);
    expect(thinking.estimatedPromptTokens).toBeLessThanOrEqual(1638);
  });

  it('puts the summary inside the single system message', () => {
    const plan = new ContextBuilder(limits).build({
      systemPrompt: 'be nice',
      history: turns(2),
      userMessage: 'hi',
      summary: 'user likes TypeScript',
    });

    expect(plan.summaryUsed).toBe(true);
    expect(plan.messages.filter((m) => m.role === 'system')).toHaveLength(1);
    expect(plan.messages[0].content).toBe(
      composeSystemPrompt('be nice', 'user likes TypeScript'),
    );
    expect(plan.messages[0].content).toContain('user likes TypeScript');
    expect(plan.includedHistory).toBe(2);
  });

  it('counts the summary against the budget, leaving less room for history', () => {
    const history = turns(6, sized(300).slice(0, -3));
    const builder = new ContextBuilder(limits);

    const without = builder.build({
      systemPrompt: '',
      history,
      userMessage: 'hi',
    });
    const withSummary = builder.build({
      systemPrompt: '',
      history,
      userMessage: 'hi',
      summary: sized(1000),
    });

    expect(without.includedHistory).toBe(6);
    expect(withSummary.includedHistory).toBeLessThan(6);
    expect(withSummary.estimatedPromptTokens).toBeLessThanOrEqual(
      withSummary.inputBudget,
    );
  });

  it('drops the summary rather than rejecting a big message', () => {
    const plan = new ContextBuilder(limits).build({
      systemPrompt: '',
      history: [],
      userMessage: sized(2000),
      summary: sized(1000),
    });

    expect(plan.summaryUsed).toBe(false);
    expect(plan.messages).toHaveLength(1);
  });

  it('rejects a message that cannot fit even alone', () => {
    const builder = new ContextBuilder(limits);

    expect(() =>
      builder.build({
        systemPrompt: '',
        history: [],
        userMessage: sized(3000),
      }),
    ).toThrow(ContextOverflowError);
  });
});
