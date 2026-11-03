export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  /** Model reasoning. Off by default; the user can enable it per message. */
  think: boolean;
  /** Upper bound for the answer, thinking included. */
  maxOutputTokens: number;
  temperature?: number;
}

export type ChatChunk =
  | { type: 'thinking'; text: string }
  | { type: 'content'; text: string }
  | {
      type: 'done';
      /** `stop` = finished naturally, `length` = hit maxOutputTokens. */
      doneReason: string;
      promptTokens: number | null;
      completionTokens: number | null;
      loadDurationMs: number | null;
      totalDurationMs: number | null;
    };

export type ChatResult = Omit<Extract<ChatChunk, { type: 'done' }>, 'type'>;

/**
 * Lower number = served first. User-facing chat always jumps ahead of
 * background work (titles, summaries, embeddings).
 */
export enum LlmPriority {
  Chat = 0,
  Title = 1,
  Summary = 2,
  Embedding = 3,
}
