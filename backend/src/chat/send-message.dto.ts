import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

/** ~430 tokens each at 768 px: three already take half the prompt budget. */
export const MAX_IMAGES_PER_MESSAGE = 3;

export class SendMessageDto {
  /**
   * Hard character cap as a first line of defence. The real limit is the
   * token budget, checked by ContextBuilder (a few thousand characters).
   * May be empty when images are attached ("what is this?" is implied).
   */
  @IsString()
  @MaxLength(20_000)
  content: string;

  /** Enables model reasoning for this message only. */
  @IsOptional()
  @IsBoolean()
  think?: boolean;

  /** Uploads from POST /attachments, in the order they should be shown. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_IMAGES_PER_MESSAGE)
  @IsUUID('all', { each: true })
  attachmentIds?: string[];
}
