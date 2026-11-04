"use client";

import { usePathname } from "next/navigation";
import { useCallback, useState } from "react";
import { useConversations } from "@/components/conversations/conversations-provider";
import { activeIdFrom } from "@/components/sidebar/sidebar";
import type { Conversation } from "@/lib/api";
import { ChatApp } from "./chat-app";

type Session = { key: number; conversationId: string | null };

/**
 * Keeps the chat mounted in the layout instead of in each page.
 *
 * The URL picks the conversation, but the chat must NOT remount when a new
 * conversation gets its id on the first send (that would kill the stream).
 * So the URL is updated with history.replaceState, and this component only
 * starts a fresh chat (new `key`) when the URL points somewhere else.
 */
export function ChatHost() {
  const routeId = activeIdFrom(usePathname());
  const { upsert } = useConversations();
  const [session, setSession] = useState<Session>({ key: 0, conversationId: routeId });
  const [lastRouteId, setLastRouteId] = useState(routeId);

  // Reacting to a route change during render (React's recommended pattern
  // for deriving state from props, instead of an effect + extra render).
  if (routeId !== lastRouteId) {
    setLastRouteId(routeId);
    const isOwnNewConversation = routeId !== null && routeId === session.conversationId;
    if (!isOwnNewConversation) setSession({ key: session.key + 1, conversationId: routeId });
  }

  const onCreated = useCallback(
    (conversation: Conversation) => {
      upsert(conversation);
      setSession((s) => ({ ...s, conversationId: conversation.id }));
      window.history.replaceState(null, "", `/c/${conversation.id}`);
    },
    [upsert],
  );

  return <ChatApp key={session.key} conversationId={session.conversationId} onCreated={onCreated} />;
}
