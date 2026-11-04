import {
  toAttachmentDto,
  type AttachmentDto,
} from '../attachments/attachment.dto.js';
import { estimateImageTokens } from '../context/token-estimator.js';
import type {
  Attachment,
  Conversation,
  Message,
} from '../generated/prisma/client.js';

/** API shape of a message. Internal fields (token counts) stay server-side. */
export interface MessageDto {
  id: string;
  role: Message['role'];
  content: string;
  thinking: string | null;
  status: Message['status'];
  createdAt: string;
  attachments: AttachmentDto[];
}

export interface ConversationDto {
  id: string;
  title: string | null;
  /** null = default (see GET /settings/defaults). */
  model: string | null;
  systemPrompt: string | null;
  temperature: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationWithMessagesDto extends ConversationDto {
  messages: MessageDto[];
}

export const toMessageDto = (
  m: Message & { attachments?: Attachment[] },
): MessageDto => ({
  id: m.id,
  role: m.role,
  content: m.content,
  thinking: m.thinking,
  status: m.status,
  createdAt: m.createdAt.toISOString(),
  attachments: (m.attachments ?? []).map((a) =>
    toAttachmentDto(a, estimateImageTokens(a.width, a.height)),
  ),
});

export const toConversationDto = (c: Conversation): ConversationDto => ({
  id: c.id,
  title: c.title,
  model: c.model,
  systemPrompt: c.systemPrompt,
  temperature: c.temperature,
  createdAt: c.createdAt.toISOString(),
  updatedAt: c.updatedAt.toISOString(),
});
