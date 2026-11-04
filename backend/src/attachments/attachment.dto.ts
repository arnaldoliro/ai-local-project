import type { Attachment } from '../generated/prisma/client.js';

export interface AttachmentDto {
  id: string;
  mimeType: string;
  width: number;
  height: number;
  sizeBytes: number;
  /** Estimated prompt tokens the image takes when sent to the model. */
  tokens: number;
}

export const toAttachmentDto = (
  a: Pick<Attachment, 'id' | 'mimeType' | 'width' | 'height' | 'sizeBytes'>,
  tokens: number,
): AttachmentDto => ({
  id: a.id,
  mimeType: a.mimeType,
  width: a.width,
  height: a.height,
  sizeBytes: a.sizeBytes,
  tokens,
});
