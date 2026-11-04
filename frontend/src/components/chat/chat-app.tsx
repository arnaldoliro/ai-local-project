"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useState } from "react";
import { useConversations } from "@/components/conversations/conversations-provider";
import { MenuIcon } from "@/components/icons";
import { useSettingsData } from "@/components/settings/settings-data";
import { SettingsPanel } from "@/components/settings/settings-panel";
import { useShell } from "@/components/shell/shell";
import { StatusIndicator } from "@/components/status-indicator";
import { useAttachments } from "@/hooks/use-attachments";
import { useChat } from "@/hooks/use-chat";
import type { Conversation, ConversationSettings } from "@/lib/api";
import { Composer } from "./composer";
import { EmptyState } from "./empty-state";
import { MessageList } from "./message-list";

type Props = {
  conversationId: string | null;
  onCreated: (conversation: Conversation) => void;
};

const NO_SETTINGS: ConversationSettings = {
  model: null,
  systemPrompt: null,
  temperature: null,
  memoryEnabled: true,
};

export function ChatApp({ conversationId, onCreated }: Props) {
  const chat = useChat(conversationId, onCreated);
  const { conversations, update } = useConversations();
  const { defaults, findModel } = useSettingsData();
  const { openSidebar } = useShell();
  const [draft, setDraft] = useState("");
  // Thinking is per message: it switches back off after each send.
  const [think, setThink] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // A new chat can be configured before it exists; sent on creation.
  const [pendingSettings, setPendingSettings] = useState(NO_SETTINGS);
  const attachments = useAttachments();

  const conversation = conversations.find((c) => c.id === chat.conversationId);
  const title = conversation?.title ?? null;
  const settings: ConversationSettings = conversation
    ? {
        model: conversation.model,
        systemPrompt: conversation.systemPrompt,
        temperature: conversation.temperature,
        memoryEnabled: conversation.memoryEnabled,
      }
    : pendingSettings;
  const model = settings.model ?? defaults?.model ?? null;
  // Unknown (list not loaded yet) counts as supported; the backend decides.
  const modelInfo = model ? findModel(model) : undefined;
  const thinkSupported = modelInfo?.capabilities.thinking ?? true;
  const visionSupported = modelInfo?.capabilities.vision ?? true;

  const saveSettings = async (next: ConversationSettings) => {
    if (chat.conversationId) await update(chat.conversationId, next);
    else setPendingSettings(next);
  };

  const submit = async () => {
    const content = draft.trim();
    const images = attachments.ready;
    if ((!content && images.length === 0) || attachments.busy || chat.isStreaming) return;
    const thinkForThis = think && thinkSupported;
    setDraft("");
    setThink(false);

    const saved = await chat.send(content, thinkForThis, pendingSettings, images);
    if (saved) attachments.clear();
    else {
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

        <StatusIndicator model={model} onClick={() => setSettingsOpen(true)} />
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
          thinkSupported={thinkSupported}
          streaming={chat.isStreaming}
          error={chat.sendError ?? attachments.limitError}
          onDismissError={chat.dismissError}
          attachments={attachments.items}
          attachmentsBusy={attachments.busy}
          readyAttachments={attachments.ready.length}
          onAddFiles={attachments.add}
          onRemoveAttachment={attachments.remove}
          visionSupported={visionSupported}
        />
      )}

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        value={settings}
        isNewChat={!chat.conversationId}
        onSave={saveSettings}
      />
    </div>
  );
}
