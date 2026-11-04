"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useState } from "react";
import { ChevronIcon, SparkIcon } from "@/components/icons";
import type { MemoryRef } from "@/lib/api";

/** "Remembered from N conversations", expandable to the list of sources. */
export function MemoryNote({ memories }: { memories: MemoryRef[] }) {
  const [open, setOpen] = useState(false);
  // Several chunks may come from the same conversation: list it once.
  const sources = [...new Map(memories.map((m) => [m.conversationId, m])).values()];
  if (sources.length === 0) return null;

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-full border border-accent/25 bg-accent/8 px-2.5 py-1 text-[0.7rem] text-muted transition-colors hover:text-foreground"
      >
        <SparkIcon className="size-3 text-accent" />
        Lembrou de {sources.length === 1 ? "1 conversa" : `${sources.length} conversas`}
        <motion.span animate={{ rotate: open ? 90 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronIcon className="size-3" />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.ul
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="mt-1.5 overflow-hidden border-l-2 border-accent/30 pl-3"
          >
            {sources.map((m) => (
              <li key={m.conversationId} className="py-0.5 text-xs">
                <Link href={`/c/${m.conversationId}`} className="text-muted hover:text-accent hover:underline">
                  {m.conversationTitle ?? "Conversa sem título"}
                </Link>
                <span className="ml-2 font-mono text-[0.65rem] text-muted/60">
                  {Math.round(m.similarity * 100)}% parecido
                </span>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
