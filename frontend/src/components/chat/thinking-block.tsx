"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { BrainIcon, ChevronIcon } from "@/components/icons";

/** Collapsible view of the model's reasoning (only when thinking was on). */
export function ThinkingBlock({ text, active }: { text: string; active: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-foreground"
      >
        <BrainIcon className="size-3.5" />
        <span className={active ? "shimmer" : undefined}>{active ? "Raciocinando…" : "Raciocínio"}</span>
        <motion.span animate={{ rotate: open ? 90 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronIcon className="size-3.5" />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <p className="mt-2 whitespace-pre-wrap border-l-2 border-accent/30 pl-3 text-xs leading-relaxed text-muted">
              {text}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
