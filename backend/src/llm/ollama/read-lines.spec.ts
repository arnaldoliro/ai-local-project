import { readLines } from './read-lines.js';

async function* bytes(...parts: string[]) {
  const encoder = new TextEncoder();
  for (const part of parts) yield encoder.encode(part);
}

const collect = async (source: AsyncIterable<string>) => {
  const lines: string[] = [];
  for await (const line of source) lines.push(line);
  return lines;
};

describe('readLines', () => {
  it('rebuilds lines split across network chunks', async () => {
    const lines = await collect(
      readLines(bytes('{"a":', '1}\n{"b"', ':2}\n{"c":3}')),
    );

    expect(lines).toEqual(['{"a":1}', '{"b":2}', '{"c":3}']);
  });

  it('skips blank lines', async () => {
    expect(await collect(readLines(bytes('one\n\n\ntwo\n')))).toEqual([
      'one',
      'two',
    ]);
  });

  it('does not break multi-byte characters split between chunks', async () => {
    const encoded = new TextEncoder().encode('ação\n');
    async function* split() {
      yield encoded.slice(0, 2);
      yield encoded.slice(2);
    }

    expect(await collect(readLines(split()))).toEqual(['ação']);
  });
});
