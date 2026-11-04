"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { PencilIcon, TrashIcon } from "@/components/icons";
import type { Conversation } from "@/lib/api";

type Props = {
  conversation: Conversation;
  active: boolean;
  onNavigate: () => void;
  onRename: (title: string) => Promise<void>;
  onDelete: () => void;
};

export function ConversationItem({ conversation, active, onNavigate, onRename, onDelete }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const startEditing = () => {
    setDraft(conversation.title ?? "");
    setEditing(true);
  };

  const save = async (event?: FormEvent) => {
    event?.preventDefault();
    const title = draft.trim();
    setEditing(false);
    if (title && title !== conversation.title) await onRename(title);
  };

  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -8, height: 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 34 }}
      className="group relative"
    >
      {active && (
        <motion.span
          layoutId="active-conversation"
          className="absolute inset-0 rounded-lg bg-white/[0.06]"
          transition={{ type: "spring", stiffness: 420, damping: 36 }}
        />
      )}

      {editing ? (
        <form onSubmit={(e) => void save(e)} className="relative px-1 py-1">
          <input
            autoFocus
            value={draft}
            maxLength={80}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => void save()}
            onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
            aria-label="Novo título"
            className="w-full rounded-md border border-accent/40 bg-background px-2 py-1 text-sm outline-none"
          />
        </form>
      ) : (
        <>
          <Link
            href={`/c/${conversation.id}`}
            onClick={onNavigate}
            className={`relative block truncate rounded-lg py-2 pl-3 pr-16 text-sm transition-colors ${
              active ? "text-foreground" : "text-muted hover:text-foreground"
            }`}
          >
            <AnimatePresence mode="wait" initial={false}>
              {/* A generated title fades in over the placeholder. */}
              <motion.span
                key={conversation.title ?? "untitled"}
                initial={{ opacity: 0, filter: "blur(4px)" }}
                animate={{ opacity: 1, filter: "blur(0px)" }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.35 }}
                className={conversation.title ? undefined : "italic text-muted/70"}
              >
                {conversation.title ?? "Nova conversa"}
              </motion.span>
            </AnimatePresence>
          </Link>

          <div
            className={`absolute inset-y-0 right-1.5 flex items-center gap-0.5 transition-opacity ${
              active ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
            }`}
          >
            <button
              type="button"
              onClick={startEditing}
              aria-label="Renomear conversa"
              className="rounded-md p-1.5 text-muted transition-colors hover:bg-white/5 hover:text-foreground"
            >
              <PencilIcon className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={onDelete}
              aria-label="Apagar conversa"
              className="rounded-md p-1.5 text-muted transition-colors hover:bg-danger/10 hover:text-danger"
            >
              <TrashIcon className="size-3.5" />
            </button>
          </div>
        </>
      )}
    </motion.li>
  );
}
