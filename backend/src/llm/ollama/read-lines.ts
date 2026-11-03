/**
 * Splits a byte stream into text lines. Ollama streams NDJSON: one JSON
 * object per line, and a network chunk may hold half a line or several.
 */
export async function* readLines(
  body: AsyncIterable<Uint8Array>,
): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  let buffer = '';

  for await (const bytes of body) {
    buffer += decoder.decode(bytes, { stream: true });
    let newline: number;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) yield line;
    }
  }

  buffer += decoder.decode();
  if (buffer.trim()) yield buffer.trim();
}
