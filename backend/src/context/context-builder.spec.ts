import {
  composeSystemPrompt,
  ContextBuilder,
  ContextOverflowError,
  withImagePlaceholder,
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
  memoryMaxTokens: 600,
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

  describe('memories', () => {
    it('adds memories to the system message after the summary', () => {
      const plan = new ContextBuilder(limits).build({
        systemPrompt: 'be nice',
        history: [],
        userMessage: 'when is the deadline?',
        summary: 'project Atlas',
        memories: ['- [Atlas] deadline is Dec 15'],
      });

      const system = plan.messages[0].content;
      expect(plan.memoriesUsed).toBe(1);
      expect(system.indexOf('project Atlas')).toBeLessThan(
        system.indexOf('deadline is Dec 15'),
      );
      expect(plan.messages.filter((m) => m.role === 'system')).toHaveLength(1);
    });

    it('stops at the memory quota, keeping the most relevant first', () => {
      const memory = (n: number) => `- [m${n}] ${'x'.repeat(600)}`; // ~200 tokens each
      const plan = new ContextBuilder(limits).build({
        systemPrompt: '',
        history: [],
        userMessage: 'hi',
        memories: [memory(1), memory(2), memory(3), memory(4)],
      });

      expect(plan.memoriesUsed).toBe(2);
      expect(plan.messages[0].content).toContain('[m1]');
      expect(plan.messages[0].content).not.toContain('[m3]');
    });

    it('gives memories priority over history, within their quota', () => {
      const history = turns(20, sized(150).slice(0, -3));
      const plan = new ContextBuilder(limits).build({
        systemPrompt: '',
        history,
        userMessage: 'hi',
        memories: ['- [m1] short memory'],
      });

      expect(plan.memoriesUsed).toBe(1);
      expect(plan.droppedHistory).toBeGreaterThan(0);
      expect(plan.estimatedPromptTokens).toBeLessThanOrEqual(plan.inputBudget);
    });

    it('drops memories that do not fit next to a big message', () => {
      const plan = new ContextBuilder(limits).build({
        systemPrompt: '',
        history: [],
        userMessage: sized(2600),
        memories: ['- [m1] some memory'],
      });

      expect(plan.memoriesUsed).toBe(0);
    });
  });

  describe('images', () => {
    const img = (id: string, tokens = 300) => ({ id, tokens });

    it('sends the current images and counts them as mandatory', () => {
      const plan = new ContextBuilder(limits).build({
        systemPrompt: '',
        history: [],
        userMessage: 'what is this?',
        userImages: [img('a'), img('b')],
      });

      expect(plan.messages.at(-1)).toEqual({
        role: 'user',
        content: 'what is this?',
        imageIds: ['a', 'b'],
      });
      expect(plan.estimatedPromptTokens).toBeGreaterThanOrEqual(600);
      expect(plan.imagesSent).toBe(2);
    });

    it('rejects a message whose images alone overflow the budget', () => {
      expect(() =>
        new ContextBuilder(limits).build({
          systemPrompt: '',
          history: [],
          userMessage: '',
          userImages: [img('a', 1000), img('b', 1000), img('c', 1000)],
        }),
      ).toThrow(ContextOverflowError);
    });

    it('re-sends only the newest history images; older ones become text', () => {
      const plan = new ContextBuilder(limits).build({
        systemPrompt: '',
        history: [
          { role: 'user', content: 'old photo', images: [img('old')] },
          { role: 'assistant', content: 'a cat' },
          { role: 'user', content: 'new photo', images: [img('new')] },
          { role: 'assistant', content: 'a dog' },
        ],
        userMessage: 'what color is it?',
      });

      expect(plan.messages[0]).toEqual({
        role: 'user',
        content: withImagePlaceholder('old photo', 1),
      });
      expect(plan.messages[2]).toEqual({
        role: 'user',
        content: 'new photo',
        imageIds: ['new'],
      });
      expect(plan.imagesSent).toBe(1);
    });

    it('uses placeholders when the model has no vision', () => {
      const plan = new ContextBuilder(limits).build({
        systemPrompt: '',
        history: [{ role: 'user', content: '', images: [img('a'), img('b')] }],
        userMessage: 'hi',
        visionEnabled: false,
      });

      expect(plan.messages[0]).toEqual({
        role: 'user',
        content: withImagePlaceholder('', 2),
      });
      expect(plan.imagesSent).toBe(0);
    });

    it('falls back to the placeholder when the images do not fit', () => {
      const plan = new ContextBuilder(limits).build({
        systemPrompt: '',
        history: [{ role: 'user', content: 'big', images: [img('a', 2700)] }],
        userMessage: 'hi',
      });

      expect(plan.messages[0].imageIds).toBeUndefined();
      expect(plan.messages[0].content).toContain(
        '[o usuário enviou uma imagem aqui]',
      );
    });
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
