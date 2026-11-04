"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  deleteConversation,
  EVENTS_URL,
  listConversations,
  updateConversation,
  type Conversation,
  type ConversationSettings,
  type ConversationEvent,
} from "@/lib/api";

type ConversationsContext = {
  conversations: Conversation[];
  loaded: boolean;
  /** Adds or replaces a conversation, keeping the list newest first. */
  upsert: (conversation: Conversation) => void;
  /** Rename and/or change settings; throws ApiError when the server refuses. */
  update: (id: string, patch: Partial<ConversationSettings> & { title?: string }) => Promise<void>;
  remove: (id: string) => Promise<void>;
};

const Context = createContext<ConversationsContext | null>(null);

const byRecent = (a: Conversation, b: Conversation) =>
  new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();

/**
 * Single source of truth for the sidebar list, shared with the chat.
 *
 * Loaded once, then kept fresh by the server's event stream (GET /events):
 * that's how a title generated in the background shows up by itself.
 * EventSource reconnects on its own if the backend restarts.
 */
export function ConversationsProvider({ children }: { children: ReactNode }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loaded, setLoaded] = useState(false);

  const upsert = useCallback((conversation: Conversation) => {
    setConversations((list) =>
      [conversation, ...list.filter((c) => c.id !== conversation.id)].sort(byRecent),
    );
  }, []);

  const drop = useCallback((id: string) => {
    setConversations((list) => list.filter((c) => c.id !== id));
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    listConversations(controller.signal).then(
      (list) => {
        setConversations(list);
        setLoaded(true);
      },
      () => {
        if (!controller.signal.aborted) setLoaded(true);
      },
    );

    const source = new EventSource(EVENTS_URL);
    const onUpdated = (e: MessageEvent<string>) => {
      const event = JSON.parse(e.data) as Extract<ConversationEvent, { type: "conversation.updated" }>;
      upsert(event.conversation);
    };
    const onDeleted = (e: MessageEvent<string>) => {
      const event = JSON.parse(e.data) as Extract<ConversationEvent, { type: "conversation.deleted" }>;
      drop(event.id);
    };
    source.addEventListener("conversation.updated", onUpdated);
    source.addEventListener("conversation.deleted", onDeleted);

    return () => {
      controller.abort();
      source.close();
    };
  }, [upsert, drop]);

  const update = useCallback(
    async (id: string, patch: Partial<ConversationSettings> & { title?: string }) =>
      upsert(await updateConversation(id, patch)),
    [upsert],
  );

  const remove = useCallback(
    async (id: string) => {
      await deleteConversation(id);
      drop(id);
    },
    [drop],
  );

  const value = useMemo(
    () => ({ conversations, loaded, upsert, update, remove }),
    [conversations, loaded, upsert, update, remove],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useConversations(): ConversationsContext {
  const context = useContext(Context);
  if (!context) throw new Error("useConversations must be used inside ConversationsProvider");
  return context;
}
