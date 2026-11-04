import {
  toAttachmentDto,
  type AttachmentDto,
} from '../attachments/attachment.dto.js';
import { estimateImageTokens } from '../context/token-estimator.js';
import type { MemoryRef } from '../memory/memory.prompt.js';
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
  /** Memories injected to produce this answer (assistant messages only). */
  memories: MemoryRef[];
}

export interface ConversationDto {
  id: string;
  title: string | null;
  /** null = default (see GET /settings/defaults). */
  model: string | null;
  systemPrompt: string | null;
  temperature: number | null;
  memoryEnabled: boolean;
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
  memories: Array.isArray(m.memories)
    ? (m.memories as unknown as MemoryRef[])
    : [],
});

export const toConversationDto = (c: Conversation): ConversationDto => ({
  id: c.id,
  title: c.title,
  model: c.model,
  systemPrompt: c.systemPrompt,
  temperature: c.temperature,
  memoryEnabled: c.memoryEnabled,
  createdAt: c.createdAt.toISOString(),
  updatedAt: c.updatedAt.toISOString(),
});
