export type SseEvent = { event: string; data: string };

/**
 * Reads a text/event-stream body from fetch().
 *
 * EventSource would parse this for us, but it only does GET requests, and
 * sending a message needs a POST body. The format is simple: events are
 * separated by a blank line; each has `event:` and `data:` lines, and lines
 * starting with `:` are comments (the server's heartbeat).
 */
export async function* readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<SseEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let boundary: number;
      while ((boundary = buffer.indexOf("\n\n")) >= 0) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const parsed = parseBlock(block);
        if (parsed) yield parsed;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function parseBlock(block: string): SseEvent | null {
  let event = "message";
  const data: string[] = [];

  for (const line of block.split("\n")) {
    if (line.startsWith(":")) continue;
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
  }
  return data.length ? { event, data: data.join("\n") } : null;
}
