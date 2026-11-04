export interface ImageInfo {
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  extension: 'png' | 'jpg' | 'webp';
  width: number;
  height: number;
}

/**
 * Identifies an image by its magic bytes (never trusting the Content-Type
 * the client sent) and reads its dimensions from the header.
 *
 * Why by hand: decoding libraries (sharp, image-size) would be a dependency
 * just to read two numbers that sit at known offsets. Only the formats the
 * vision model accepts are recognized; anything else returns null.
 */
export function readImageInfo(buf: Buffer): ImageInfo | null {
  try {
    return readPng(buf) ?? readJpeg(buf) ?? readWebp(buf);
  } catch {
    return null; // truncated or corrupt header
  }
}

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

/** Signature, then the IHDR chunk: width and height are big-endian at 16/20. */
function readPng(buf: Buffer): ImageInfo | null {
  if (buf.length < 24 || !buf.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
  if (buf.toString('ascii', 12, 16) !== 'IHDR') return null;
  return dims('image/png', 'png', buf.readUInt32BE(16), buf.readUInt32BE(20));
}

/**
 * JPEG is a list of segments (FF xx + 16-bit length). The frame header
 * (SOFn) holds height then width. DHT/JPG/DAC share the C4/C8/CC range
 * but are not frame headers.
 */
function readJpeg(buf: Buffer): ImageInfo | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;

  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = buf[i + 1];
    // Standalone markers have no length.
    if (
      marker === 0xd8 ||
      marker === 0x01 ||
      (marker >= 0xd0 && marker <= 0xd7)
    ) {
      i += 2;
      continue;
    }
    const isFrame =
      marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isFrame) {
      return dims(
        'image/jpeg',
        'jpg',
        buf.readUInt16BE(i + 7),
        buf.readUInt16BE(i + 5),
      );
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}

/** RIFF container; the first chunk says how the size is encoded. */
function readWebp(buf: Buffer): ImageInfo | null {
  if (buf.length < 30) return null;
  if (
    buf.toString('ascii', 0, 4) !== 'RIFF' ||
    buf.toString('ascii', 8, 12) !== 'WEBP'
  ) {
    return null;
  }

  switch (buf.toString('ascii', 12, 16)) {
    case 'VP8 ': // lossy: 14-bit sizes after the frame tag
      return dims(
        'image/webp',
        'webp',
        buf.readUInt16LE(26) & 0x3fff,
        buf.readUInt16LE(28) & 0x3fff,
      );
    case 'VP8L': {
      // lossless: two 14-bit (minus one) fields packed in 4 bytes
      const b = buf.subarray(21, 25);
      const width = 1 + (((b[1] & 0x3f) << 8) | b[0]);
      const height =
        1 + (((b[3] & 0x0f) << 10) | (b[2] << 2) | ((b[1] & 0xc0) >> 6));
      return dims('image/webp', 'webp', width, height);
    }
    case 'VP8X': // extended: 24-bit (minus one) canvas size
      return dims(
        'image/webp',
        'webp',
        1 + buf.readUIntLE(24, 3),
        1 + buf.readUIntLE(27, 3),
      );
    default:
      return null;
  }
}

function dims(
  mimeType: ImageInfo['mimeType'],
  extension: ImageInfo['extension'],
  width: number,
  height: number,
): ImageInfo | null {
  return width > 0 && height > 0
    ? { mimeType, extension, width, height }
    : null;
}
