import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class SendMessageDto {
  /**
   * Hard character cap as a first line of defence. The real limit is the
   * token budget, checked by ContextBuilder (a few thousand characters).
   */
  @IsString()
  @IsNotEmpty()
  @MaxLength(20_000)
  content: string;

  /** Enables model reasoning for this message only. */
  @IsOptional()
  @IsBoolean()
  think?: boolean;
}
