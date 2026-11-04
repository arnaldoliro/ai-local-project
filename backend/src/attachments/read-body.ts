import { PayloadTooLargeException } from '@nestjs/common';
import type { Request } from 'express';

/**
 * Reads a raw request body into memory, refusing it as soon as it passes
 * `maxBytes` (the client can lie in Content-Length, so count what arrives).
 *
 * Why not multer/multipart: the browser can send the file itself as the
 * body (`fetch(url, { body: file })`), which needs no parsing library. The
 * JSON body parser ignores image/* requests, so the stream is untouched here.
 */
export function readBody(req: Request, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;

    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        req.removeAllListeners('data');
        req.resume(); // drain the rest without keeping it
        reject(
          new PayloadTooLargeException({
            code: 'file_too_large',
            message: `Max ${maxBytes} bytes`,
          }),
        );
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
