import { buildExchangeText, chunkText } from './chunker.js';

describe('buildExchangeText', () => {
  it('labels both sides of the exchange', () => {
    expect(buildExchangeText(' oi ', 'olá')).toBe(
      'Usuário: oi\nAssistente: olá',
    );
  });

  it('omits an empty side', () => {
    expect(buildExchangeText('', 'só a resposta')).toBe(
      'Assistente: só a resposta',
    );
  });
});

describe('chunkText', () => {
  it('keeps short text as a single chunk', () => {
    expect(chunkText('Uma frase curta.')).toEqual(['Uma frase curta.']);
  });

  it('returns nothing for blank text', () => {
    expect(chunkText('  \n\n ')).toEqual([]);
  });

  it('never exceeds the maximum size', () => {
    const text = Array.from(
      { length: 80 },
      (_, i) => `Frase número ${i} sobre o projeto.`,
    ).join(' ');
    const chunks = chunkText(text, 200, 40);

    expect(chunks.length).toBeGreaterThan(5);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(200);
  });

  it('prefers cutting at the end of a sentence', () => {
    const text = `${'a'.repeat(120)}. ${'b'.repeat(120)}. ${'c'.repeat(120)}.`;
    const [first] = chunkText(text, 260, 0);

    expect(first.endsWith('.')).toBe(true);
  });

  it('overlaps consecutive chunks so nothing falls in a gap', () => {
    const words = Array.from({ length: 200 }, (_, i) => `w${i}`);
    const chunks = chunkText(words.join(' '), 100, 30);

    for (let i = 1; i < chunks.length; i++) {
      const lastWordOfPrevious = chunks[i - 1].split(' ').at(-1)!;
      expect(chunks[i]).toContain(lastWordOfPrevious);
    }
    // Every word appears somewhere.
    const all = chunks.join(' ');
    for (const word of words) expect(all).toContain(word);
  });

  it('hard-cuts a single word longer than a chunk, and still terminates', () => {
    const chunks = chunkText('x'.repeat(1000), 300, 50);

    expect(chunks.length).toBeGreaterThanOrEqual(3);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(300);
  });
});
