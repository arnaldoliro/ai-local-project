import { formatMemory } from './memory.prompt.js';

const hit = {
  conversationId: 'c1',
  conversationTitle: 'Projeto Atlas',
  date: new Date('2026-11-04T10:00:00Z'),
  content: 'Usuário: o prazo é\n  15 de dezembro',
  similarity: 0.8,
};

describe('formatMemory', () => {
  it('labels the source conversation and flattens whitespace', () => {
    expect(formatMemory(hit)).toBe(
      '- (da conversa "Projeto Atlas") Usuário: o prazo é 15 de dezembro',
    );
  });

  it('never includes the date (a small model mistook it for an answer)', () => {
    expect(formatMemory(hit)).not.toMatch(/2026|04\/11/);
  });

  it('handles untitled conversations', () => {
    expect(formatMemory({ ...hit, conversationTitle: null })).toMatch(
      /^- \(de uma conversa anterior\)/,
    );
  });
});
