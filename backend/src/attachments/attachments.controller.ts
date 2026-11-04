import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AttachmentsService, MAX_UPLOAD_BYTES } from './attachments.service.js';
import { readBody } from './read-body.js';

@Controller('attachments')
export class AttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}

  /**
   * The image is the raw request body (Content-Type: image/*). Validation
   * is done on the bytes, the header only routes the request here.
   */
  @Post()
  async upload(
    @Req() req: Request,
    @Headers('content-type') contentType?: string,
  ) {
    if (!contentType?.startsWith('image/')) {
      throw new BadRequestException({
        code: 'unsupported_image',
        message: 'Send the image as the body with an image/* Content-Type',
      });
    }
    return this.attachments.create(await readBody(req, MAX_UPLOAD_BYTES));
  }

  @Get(':id')
  async file(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { attachment, stream } = await this.attachments.openFile(id);
    res.set({
      'Content-Type': attachment.mimeType,
      'X-Content-Type-Options': 'nosniff',
      // Content never changes for an id.
      'Cache-Control': 'private, max-age=31536000, immutable',
    });
    return new StreamableFile(stream);
  }

  /** Removes an upload the user gave up on before sending. */
  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    await this.attachments.removeUnlinked(id);
  }
}
