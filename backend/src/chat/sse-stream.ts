import type { Response } from 'express';

const HEARTBEAT_MS = 15_000;

/**
 * Minimal Server-Sent Events writer over an Express response.
 *
 * Why not Nest's @Sse(): it only supports GET (the browser's EventSource
 * can't POST either), and we need a POST body with the message. Writing the
 * text/event-stream format by hand is a few lines:
 *
 *   event: token
 *   data: {"text":"Olá"}
 *   <blank line>
 *
 * The heartbeat comment keeps the connection alive while the model loads
 * (~65 s cold), when no real event is flowing.
 */
export class SseStream {
  private readonly heartbeat: NodeJS.Timeout;

  constructor(private readonly res: Response) {
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // disables proxy buffering
    res.flushHeaders();

    this.heartbeat = setInterval(() => this.write(': ping\n\n'), HEARTBEAT_MS);
  }

  get isClosed(): boolean {
    return this.res.writableEnded || this.res.destroyed;
  }

  send(event: string, data: unknown): void {
    this.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  end(): void {
    clearInterval(this.heartbeat);
    if (!this.isClosed) this.res.end();
  }

  private write(chunk: string): void {
    if (!this.isClosed) this.res.write(chunk);
  }
}
