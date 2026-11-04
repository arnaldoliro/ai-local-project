"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useState } from "react";
import { useConversations } from "@/components/conversations/conversations-provider";
import { MenuIcon } from "@/components/icons";
import { useShell } from "@/components/shell/shell";
import { StatusIndicator } from "@/components/status-indicator";
import { useChat } from "@/hooks/use-chat";
import type { Conversation } from "@/lib/api";
import { Composer } from "./composer";
import { EmptyState } from "./empty-state";
import { MessageList } from "./message-list";

type Props = {
  conversationId: string | null;
  onCreated: (conversation: Conversation) => void;
};

export function ChatApp({ conversationId, onCreated }: Props) {
  const chat = useChat(conversationId, onCreated);
  const { conversations } = useConversations();
  const { openSidebar } = useShell();
  const [draft, setDraft] = useState("");
  // Thinking is per message: it switches back off after each send.
  const [think, setThink] = useState(false);

  const title = conversations.find((c) => c.id === chat.conversationId)?.title ?? null;

  const submit = async () => {
    const content = draft.trim();
    if (!content || chat.isStreaming) return;
    const thinkForThis = think;
    setDraft("");
    setThink(false);

    const saved = await chat.send(content, thinkForThis);
    if (!saved) {
      // Nothing reached the server: give the text back so it isn't lost.
      setDraft(content);
      setThink(thinkForThis);
    }
  };

  const empty = chat.loadState === "ready" && chat.messages.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-3 border-b border-white/5 px-4 py-3 sm:px-6">
        <button
          type="button"
          onClick={openSidebar}
          aria-label="Abrir conversas"
          className="-ml-1 rounded-lg p-1.5 text-muted transition-colors hover:bg-white/5 hover:text-foreground md:hidden"
        >
          <MenuIcon className="size-5" />
        </button>

        <div className="min-w-0 flex-1">
          <AnimatePresence mode="wait" initial={false}>
            <motion.h1
              key={title ?? "untitled"}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.2 }}
              className={`truncate text-sm font-medium ${title ? "text-foreground" : "text-muted"}`}
            >
              {title ?? "Nova conversa"}
            </motion.h1>
          </AnimatePresence>
        </div>

        <StatusIndicator />
      </header>

      <AnimatePresence mode="wait" initial={false}>
        {chat.loadState === "loading" ? (
          <div key="loading" className="flex-1" />
        ) : chat.loadState === "not_found" || chat.loadState === "error" ? (
          <motion.div
            key="error"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center text-sm"
          >
            <p className="text-muted">
              {chat.loadState === "not_found"
                ? "Essa conversa não existe mais."
                : "Não foi possível carregar a conversa. O backend está rodando?"}
            </p>
            <Link href="/" className="text-accent hover:underline">
              Começar uma nova conversa
            </Link>
          </motion.div>
        ) : empty ? (
          <motion.div key="empty" exit={{ opacity: 0 }} className="flex min-h-0 flex-1 flex-col">
            <EmptyState onPick={setDraft} />
          </motion.div>
        ) : (
          <motion.div
            key="messages"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex min-h-0 flex-1 flex-col"
          >
            <MessageList messages={chat.messages} phase={chat.phase} />
          </motion.div>
        )}
      </AnimatePresence>

      {chat.loadState !== "not_found" && (
        <Composer
          value={draft}
          onChange={setDraft}
          onSubmit={() => void submit()}
          onStop={chat.stop}
          think={think}
          onThinkChange={setThink}
          streaming={chat.isStreaming}
          error={chat.sendError}
          onDismissError={chat.dismissError}
        />
      )}
    </div>
  );
}
