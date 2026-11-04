import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  SYSTEM_PROMPT_MAX_LENGTH,
  TEMPERATURE_MAX,
  TEMPERATURE_MIN,
} from '../chat/chat-settings.js';

/**
 * In every settings field, `undefined` means "don't change" and `null`
 * means "back to the default". (@IsOptional skips both.)
 */
export class ConversationSettingsDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  model?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(SYSTEM_PROMPT_MAX_LENGTH)
  systemPrompt?: string | null;

  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(TEMPERATURE_MIN)
  @Max(TEMPERATURE_MAX)
  temperature?: number | null;

  /** Long-term memory for this conversation (search + being searchable). */
  @IsOptional()
  @IsBoolean()
  memoryEnabled?: boolean;
}

export class UpdateConversationDto extends ConversationSettingsDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  title?: string;
}
