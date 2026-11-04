import { readImageInfo } from './image-info.js';

/** Minimal headers: enough bytes for the parser, not full decodable files. */
function png(width: number, height: number): Buffer {
  const buf = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  buf.writeUInt32BE(13, 8);
  buf.write('IHDR', 12, 'ascii');
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

function jpeg(width: number, height: number): Buffer {
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, ...Buffer.alloc(14)]);
  const dht = Buffer.from([0xff, 0xc4, 0x00, 0x04, 0x00, 0x00]); // not a frame header
  const sof0 = Buffer.alloc(19);
  sof0.writeUInt16BE(0xffc0, 0);
  sof0.writeUInt16BE(17, 2);
  sof0[4] = 8;
  sof0.writeUInt16BE(height, 5);
  sof0.writeUInt16BE(width, 7);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, dht, sof0]);
}

function webpVp8x(width: number, height: number): Buffer {
  const buf = Buffer.alloc(30);
  buf.write('RIFF', 0, 'ascii');
  buf.write('WEBP', 8, 'ascii');
  buf.write('VP8X', 12, 'ascii');
  buf.writeUIntLE(width - 1, 24, 3);
  buf.writeUIntLE(height - 1, 27, 3);
  return buf;
}

describe('readImageInfo', () => {
  it('reads PNG dimensions', () => {
    expect(readImageInfo(png(640, 480))).toEqual({
      mimeType: 'image/png',
      extension: 'png',
      width: 640,
      height: 480,
    });
  });

  it('reads JPEG dimensions, skipping segments that are not frame headers', () => {
    expect(readImageInfo(jpeg(768, 576))).toMatchObject({
      mimeType: 'image/jpeg',
      width: 768,
      height: 576,
    });
  });

  it('reads extended WebP dimensions', () => {
    expect(readImageInfo(webpVp8x(1024, 300))).toMatchObject({
      mimeType: 'image/webp',
      width: 1024,
      height: 300,
    });
  });

  it('rejects anything that is not a supported image, whatever its name', () => {
    expect(
      readImageInfo(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')),
    ).toBeNull();
    expect(readImageInfo(Buffer.from('GIF89a......'))).toBeNull();
    expect(readImageInfo(Buffer.alloc(0))).toBeNull();
  });

  it('rejects truncated headers and zero sizes', () => {
    expect(readImageInfo(png(640, 480).subarray(0, 20))).toBeNull();
    expect(readImageInfo(png(0, 480))).toBeNull();
    expect(readImageInfo(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBeNull();
  });
});
