/**
 * Base URL of the NestJS API as seen from the browser.
 * NEXT_PUBLIC_ variables are inlined into the client bundle, so this must be
 * an address the *browser* can reach (127.0.0.1), not the compose hostname.
 */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3001";

export type DependencyStatus = { ok: boolean; detail?: string };

export type HealthResponse = {
  status: "ok" | "degraded";
  database: DependencyStatus;
  ollama: DependencyStatus;
  contextWindow: number;
  defaultModel: string;
};

export type MessageStatus = "streaming" | "complete" | "error" | "aborted";

export type Message = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  thinking: string | null;
  status: MessageStatus;
  createdAt: string;
};

export type Conversation = {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ConversationWithMessages = Conversation & { messages: Message[] };

/** Error body returned by the API before streaming starts (4xx/5xx). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, { cache: "no-store", ...init });
  if (!response.ok) throw await toApiError(response);
  return (await response.json()) as T;
}

export async function toApiError(response: Response): Promise<ApiError> {
  const body = (await response.json().catch(() => ({}))) as {
    code?: string;
    message?: string | string[];
  };
  const message = Array.isArray(body.message) ? body.message.join(", ") : body.message;
  return new ApiError(response.status, body.code ?? `http_${response.status}`, message ?? "");
}

export const fetchHealth = (signal?: AbortSignal) =>
  request<HealthResponse>("/health", { signal });

export const fetchCurrentConversation = (signal?: AbortSignal) =>
  request<{ conversation: ConversationWithMessages | null }>("/conversations/current", {
    signal,
  });

export const createConversation = () =>
  request<Conversation>("/conversations", { method: "POST" });

/** Opens the SSE stream. The caller reads `response.body` with `readSse`. */
export async function postMessage(
  conversationId: string,
  body: { content: string; think: boolean },
  signal: AbortSignal,
): Promise<Response> {
  const response = await fetch(`${API_URL}/conversations/${conversationId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok || !response.body) throw await toApiError(response);
  return response;
}
