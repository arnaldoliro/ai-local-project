import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { createReadStream, type ReadStream } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { EnvironmentVariables } from '../config/env.validation.js';
import { estimateImageTokens } from '../context/token-estimator.js';
import type { Attachment } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { toAttachmentDto, type AttachmentDto } from './attachment.dto.js';
import { readImageInfo } from './image-info.js';

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
/**
 * The UI resizes to 768 px (~432 tokens). This only stops huge images sent
 * straight to the API: ~1100 tokens is already 40% of the prompt budget.
 */
export const MAX_IMAGE_TOKENS = 1100;
/** Uploads never attached to a message are deleted after this. */
const ORPHAN_TTL_MS = 60 * 60 * 1000;

@Injectable()
export class AttachmentsService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(AttachmentsService.name);
  private cleanupTimer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly env: EnvironmentVariables,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await mkdir(this.env.UPLOADS_DIR, { recursive: true });
    await this.cleanupOrphans();
    this.cleanupTimer = setInterval(
      () => void this.cleanupOrphans(),
      ORPHAN_TTL_MS,
    );
    this.cleanupTimer.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.cleanupTimer);
  }

  /** Validates by content (magic bytes + real dimensions), then stores it. */
  async create(data: Buffer): Promise<AttachmentDto> {
    const info = readImageInfo(data);
    if (!info) {
      throw new BadRequestException({
        code: 'unsupported_image',
        message: 'Only PNG, JPEG and WebP images are accepted',
      });
    }
    const tokens = estimateImageTokens(info.width, info.height);
    if (tokens > MAX_IMAGE_TOKENS) {
      throw new PayloadTooLargeException({
        code: 'image_too_large',
        message: `Image needs ~${tokens} tokens (max ${MAX_IMAGE_TOKENS}); resize it`,
      });
    }

    const id = randomUUID();
    const fileName = `${id}.${info.extension}`;
    await writeFile(this.path(fileName), data);
    try {
      const attachment = await this.prisma.attachment.create({
        data: {
          id,
          fileName,
          mimeType: info.mimeType,
          sizeBytes: data.length,
          width: info.width,
          height: info.height,
        },
      });
      return toAttachmentDto(attachment, tokens);
    } catch (error) {
      await rm(this.path(fileName), { force: true });
      throw error;
    }
  }

  async openFile(
    id: string,
  ): Promise<{ attachment: Attachment; stream: ReadStream }> {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id },
    });
    if (!attachment) throw new NotFoundException('Attachment not found');
    return {
      attachment,
      stream: createReadStream(this.path(attachment.fileName)),
    };
  }

  /** Only uploads not yet sent can be removed (sent ones belong to history). */
  async removeUnlinked(id: string): Promise<void> {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id },
    });
    if (!attachment) throw new NotFoundException('Attachment not found');
    if (attachment.messageId) {
      throw new BadRequestException({
        code: 'attachment_in_use',
        message: 'Attachment already belongs to a message',
      });
    }
    await this.prisma.attachment.delete({ where: { id } });
    await rm(this.path(attachment.fileName), { force: true });
  }

  /** The uploads about to be sent: they must exist and not be used yet. */
  async findUnlinked(ids: string[]): Promise<Attachment[]> {
    if (ids.length === 0) return [];
    const found = await this.prisma.attachment.findMany({
      where: { id: { in: ids }, messageId: null },
    });
    if (found.length !== new Set(ids).size) {
      throw new BadRequestException({
        code: 'invalid_attachments',
        message: 'Some attachments do not exist or were already sent',
      });
    }
    // Keep the order the user chose.
    return ids.map((id) => found.find((a) => a.id === id)!);
  }

  /** Base64 for the model, read one file at a time. */
  async readBase64(ids: string[]): Promise<string[]> {
    const rows = await this.prisma.attachment.findMany({
      where: { id: { in: ids } },
    });
    const images: string[] = [];
    for (const id of ids) {
      const row = rows.find((r) => r.id === id);
      if (row)
        images.push(
          (await readFile(this.path(row.fileName))).toString('base64'),
        );
    }
    return images;
  }

  /** Files of a conversation, read before deleting it (rows go by cascade). */
  async fileNamesOfConversation(conversationId: string): Promise<string[]> {
    const rows = await this.prisma.attachment.findMany({
      where: { message: { conversationId } },
      select: { fileName: true },
    });
    return rows.map((r) => r.fileName);
  }

  async removeFiles(fileNames: string[]): Promise<void> {
    for (const name of fileNames) await rm(this.path(name), { force: true });
  }

  tokensOf(a: Pick<Attachment, 'width' | 'height'>): number {
    return estimateImageTokens(a.width, a.height);
  }

  private async cleanupOrphans(): Promise<void> {
    const orphans = await this.prisma.attachment.findMany({
      where: {
        messageId: null,
        createdAt: { lt: new Date(Date.now() - ORPHAN_TTL_MS) },
      },
    });
    if (orphans.length === 0) return;
    await this.prisma.attachment.deleteMany({
      where: { id: { in: orphans.map((o) => o.id) } },
    });
    await this.removeFiles(orphans.map((o) => o.fileName));
    this.logger.log(`Removed ${orphans.length} unsent upload(s)`);
  }

  /** `fileName` is always `<uuid>.<ext>` generated here, so no path traversal. */
  private path(fileName: string): string {
    return join(this.env.UPLOADS_DIR, fileName);
  }
}
