"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { StatusIndicator } from "@/components/status-indicator";
import { useChat } from "@/hooks/use-chat";
import { Composer } from "./composer";
import { EmptyState } from "./empty-state";
import { MessageList } from "./message-list";

export function ChatApp() {
  const chat = useChat();
  const [draft, setDraft] = useState("");
  // Thinking is per message: it switches back off after each send.
  const [think, setThink] = useState(false);

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
    <div className="flex h-dvh flex-col">
      <header className="flex items-center justify-between border-b border-white/5 px-4 py-3 sm:px-6">
        <span className="text-sm font-semibold tracking-tight">
          AI <span className="text-accent">Local</span>
        </span>
        <StatusIndicator />
      </header>

      <AnimatePresence mode="wait" initial={false}>
        {chat.loadState === "loading" ? (
          <div key="loading" className="flex-1" />
        ) : chat.loadState === "error" ? (
          <motion.div
            key="error"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-1 items-center justify-center px-6 text-center text-sm text-danger"
          >
            Não foi possível carregar a conversa. O backend está rodando?
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
    </div>
  );
}
