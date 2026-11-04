/** A retrieved chunk, ready to be shown to the model. */
export interface MemoryHit {
  conversationId: string;
  conversationTitle: string | null;
  /** When the exchange happened. */
  date: Date;
  content: string;
  /** Cosine similarity, 0..1 (vectors are normalized). */
  similarity: number;
}

/**
 * What is stored on the answer (JSON column), to show "remembered from…" in
 * the UI. A `type`, not an `interface`: only type aliases are assignable to
 * Prisma's JSON input type.
 */
export type MemoryRef = {
  conversationId: string;
  conversationTitle: string | null;
  similarity: number;
};

/**
 * Prefix recommended by Qwen3-Embedding for queries (documents get none):
 * it tells the model which kind of similarity we want.
 */
export function embeddingQuery(text: string): string {
  return `Instruct: Given a chat message, retrieve relevant passages from past conversations\nQuery: ${text}`;
}

/**
 * One line of the memory section, labeled with its source conversation.
 * No date on purpose: in a test, the 2B model answered "when is the
 * deadline?" with the conversation's date. The UI still shows the source.
 */
export function formatMemory(hit: MemoryHit): string {
  const origin = hit.conversationTitle
    ? `da conversa "${hit.conversationTitle}"`
    : 'de uma conversa anterior';
  return `- (${origin}) ${hit.content.replace(/\s+/g, ' ').trim()}`;
}

export const MEMORY_SECTION_HEADER =
  'Memórias de conversas anteriores (podem ou não ajudar; use só o que for ' +
  'relevante para a pergunta atual e não invente detalhes além delas):';
