"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ApiError,
  createConversation,
  fetchCurrentConversation,
  postMessage,
  type Message,
} from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { readSse } from "@/lib/sse";

export type UiMessage = Message & { errorCode?: string; doneReason?: string };

/** What the in-flight request is doing, shown while no text has arrived yet. */
export type ChatPhase =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "queued"; position: number }
  | { kind: "loading_model" }
  | { kind: "generating" };

type LoadState = "loading" | "ready" | "error";

const GENERATING: ChatPhase = { kind: "generating" };

export function useChat() {
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [phase, setPhase] = useState<ChatPhase>({ kind: "idle" });
  const [sendError, setSendError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const assistantIdRef = useRef<string | null>(null);
  // Tokens arrive far faster than the screen refreshes: buffer them and
  // apply once per animation frame instead of re-rendering per token.
  const bufferRef = useRef({ content: "", thinking: "" });
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchCurrentConversation(controller.signal).then(
      ({ conversation }) => {
        setConversationId(conversation?.id ?? null);
        setMessages(conversation?.messages ?? []);
        setLoadState("ready");
      },
      () => {
        if (!controller.signal.aborted) setLoadState("error");
      },
    );
    return () => controller.abort();
  }, []);

  const patchMessage = useCallback((id: string | null, patch: (m: UiMessage) => UiMessage) => {
    if (!id) return;
    setMessages((list) => list.map((m) => (m.id === id ? patch(m) : m)));
  }, []);

  const flush = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    const { content, thinking } = bufferRef.current;
    if (!content && !thinking) return;
    bufferRef.current = { content: "", thinking: "" };
    patchMessage(assistantIdRef.current, (m) => ({
      ...m,
      content: m.content + content,
      thinking: thinking ? (m.thinking ?? "") + thinking : m.thinking,
    }));
  }, [patchMessage]);

  const discardBuffer = () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    bufferRef.current = { content: "", thinking: "" };
  };

  /**
   * Sends a message and consumes the SSE stream.
   * Resolves `false` when nothing was saved (the caller restores the draft).
   */
  const send = useCallback(
    async (content: string, think: boolean): Promise<boolean> => {
      if (abortRef.current) return false;

      const controller = new AbortController();
      abortRef.current = controller;
      const stamp = Date.now();
      const tempUserId = `temp-user-${stamp}`;
      const tempAssistantId = `temp-assistant-${stamp}`;
      const createdAt = new Date(stamp).toISOString();
      assistantIdRef.current = tempAssistantId;
      let started = false;

      setSendError(null);
      setPhase({ kind: "sending" });
      setMessages((list) => [
        ...list,
        { id: tempUserId, role: "user", content, thinking: null, status: "complete", createdAt },
        { id: tempAssistantId, role: "assistant", content: "", thinking: null, status: "streaming", createdAt },
      ]);

      const removeOptimistic = () =>
        setMessages((list) => list.filter((m) => m.id !== tempUserId && m.id !== tempAssistantId));

      try {
        let id = conversationId;
        if (!id) {
          id = (await createConversation()).id;
          setConversationId(id);
        }

        const response = await postMessage(id, { content, think }, controller.signal);

        for await (const { event, data } of readSse(response.body!)) {
          const payload = JSON.parse(data);
          switch (event) {
            case "start": {
              started = true;
              const realId: string = payload.assistantMessageId;
              setMessages((list) =>
                list.map((m) =>
                  m.id === tempUserId ? payload.userMessage : m.id === tempAssistantId ? { ...m, id: realId } : m,
                ),
              );
              assistantIdRef.current = realId;
              break;
            }
            case "queued":
              setPhase({ kind: "queued", position: payload.position });
              break;
            case "generating":
              setPhase(payload.modelLoaded ? GENERATING : { kind: "loading_model" });
              break;
            case "thinking":
            case "content":
              bufferRef.current[event] += payload.text;
              setPhase(GENERATING);
              frameRef.current ??= requestAnimationFrame(flush);
              break;
            case "done":
              discardBuffer(); // the server sends the final, complete text
              patchMessage(assistantIdRef.current, () => ({ ...payload.message, doneReason: payload.doneReason }));
              break;
            case "error":
              discardBuffer();
              patchMessage(assistantIdRef.current, () => ({ ...payload.assistantMessage, errorCode: payload.code }));
              break;
          }
        }
        return true;
      } catch (error) {
        if (controller.signal.aborted) {
          // "Stop" clicked: keep the partial answer, the server saves it too.
          flush();
          patchMessage(assistantIdRef.current, (m) => ({ ...m, status: "aborted" }));
          return true;
        }
        discardBuffer();
        if (!started) {
          // Rejected before anything was saved (validation, queue full, offline).
          removeOptimistic();
          setSendError(errorMessage(error instanceof ApiError ? error.code : "network"));
          return false;
        }
        patchMessage(assistantIdRef.current, (m) => ({ ...m, status: "error", errorCode: "network" }));
        return true;
      } finally {
        abortRef.current = null;
        assistantIdRef.current = null;
        setPhase({ kind: "idle" });
      }
    },
    [conversationId, flush, patchMessage],
  );

  /** Closing the request makes the backend abort the model call. */
  const stop = useCallback(() => abortRef.current?.abort(), []);

  return {
    messages,
    loadState,
    phase,
    isStreaming: phase.kind !== "idle",
    sendError,
    dismissError: () => setSendError(null),
    send,
    stop,
  };
}
