"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { useConversations } from "@/components/conversations/conversations-provider";
import { PlusIcon } from "@/components/icons";
import type { Conversation } from "@/lib/api";
import { groupByDate } from "@/lib/date-groups";
import { ConfirmDialog } from "./confirm-dialog";
import { ConversationItem } from "./conversation-item";

export const activeIdFrom = (pathname: string) => pathname.match(/^\/c\/([^/]+)/)?.[1] ?? null;

export function Sidebar({ onNavigate }: { onNavigate: () => void }) {
  const { conversations, loaded, update, remove } = useConversations();
  const pathname = usePathname();
  const router = useRouter();
  const activeId = activeIdFrom(pathname);
  const [toDelete, setToDelete] = useState<Conversation | null>(null);

  const groups = useMemo(() => groupByDate(conversations), [conversations]);
  const cancelDelete = useCallback(() => setToDelete(null), []);

  const confirmDelete = async () => {
    if (!toDelete) return;
    const { id } = toDelete;
    setToDelete(null);
    await remove(id);
    if (id === activeId) router.push("/");
  };

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <span className="text-sm font-semibold tracking-tight">
          AI <span className="text-accent">Local</span>
        </span>
      </div>

      <div className="px-3">
        <motion.div whileTap={{ scale: 0.98 }}>
          <Link
            href="/"
            onClick={onNavigate}
            className="flex items-center gap-2 rounded-xl border border-white/8 bg-surface px-3 py-2 text-sm text-foreground transition-colors hover:border-accent/40"
          >
            <PlusIcon className="size-4 text-accent" />
            Nova conversa
          </Link>
        </motion.div>
      </div>

      <nav className="scroll-area mt-4 flex-1 overflow-y-auto px-2 pb-4" aria-label="Conversas">
        {loaded && conversations.length === 0 && (
          <p className="px-3 py-6 text-center text-xs text-muted/70">Nenhuma conversa ainda.</p>
        )}

        {groups.map((group) => (
          <section key={group.label} className="mb-4">
            <h3 className="px-3 pb-1 text-[0.68rem] font-medium uppercase tracking-wider text-muted/60">
              {group.label}
            </h3>
            <ul className="flex flex-col gap-0.5">
              <AnimatePresence initial={false}>
                {group.items.map((conversation) => (
                  <ConversationItem
                    key={conversation.id}
                    conversation={conversation}
                    active={conversation.id === activeId}
                    onNavigate={onNavigate}
                    onRename={(title) => update(conversation.id, { title })}
                    onDelete={() => setToDelete(conversation)}
                  />
                ))}
              </AnimatePresence>
            </ul>
          </section>
        ))}
      </nav>

      <ConfirmDialog
        open={toDelete !== null}
        title="Apagar conversa?"
        description={`"${toDelete?.title ?? "Nova conversa"}" e todas as mensagens dela serão apagadas. Não dá para desfazer.`}
        confirmLabel="Apagar"
        onConfirm={() => void confirmDelete()}
        onCancel={cancelDelete}
      />
    </div>
  );
}
