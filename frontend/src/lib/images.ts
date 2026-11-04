/**
 * Longest side sent to the model. The vision encoder spends one token per
 * 32x32 px block: 768x576 is ~434 tokens of a 4096 window. Bigger images
 * would eat the history budget and take much longer to encode on this GPU.
 */
export const MAX_IMAGE_SIDE = 768;
const JPEG_QUALITY = 0.85;

/**
 * Resizes and re-encodes an image in the browser, with no library: decode
 * with createImageBitmap, draw on a canvas, export as JPEG.
 *
 * Side effects worth having: the upload is tiny (~100 KB), any format the
 * browser can open works (GIF, BMP, HEIC on Safari…), and EXIF metadata,
 * including GPS location, is stripped before anything leaves the machine.
 */
export async function prepareImage(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas 2D indisponível");

    // JPEG has no transparency: paint a white background first.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, width, height);

    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Falha ao gerar a imagem"))),
        "image/jpeg",
        JPEG_QUALITY,
      ),
    );
  } finally {
    bitmap.close();
  }
}

export const isImageFile = (file: File) => file.type.startsWith("image/");
