"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef } from "react";

type Props = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({ open, title, description, confirmLabel, onConfirm, onCancel }: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Focus the safe option; Escape cancels.
  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onCancel}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
        >
          <motion.div
            role="alertdialog"
            aria-modal
            aria-labelledby="confirm-title"
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ type: "spring", stiffness: 420, damping: 32 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-white/8 bg-surface p-5 shadow-2xl"
          >
            <h2 id="confirm-title" className="text-base font-semibold">
              {title}
            </h2>
            <p className="mt-2 text-sm text-muted">{description}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                ref={cancelRef}
                type="button"
                onClick={onCancel}
                className="rounded-lg px-3 py-1.5 text-sm text-muted transition-colors hover:bg-white/5 hover:text-foreground"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={onConfirm}
                className="rounded-lg bg-danger/90 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-danger"
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
