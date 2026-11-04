"use client";

import { AnimatePresence, motion } from "motion/react";
import { CloseIcon } from "@/components/icons";
import type { PendingAttachment } from "@/hooks/use-attachments";

/** Thumbnails of the images attached to the message being written. */
export function AttachmentStrip({
  items,
  onRemove,
}: {
  items: PendingAttachment[];
  onRemove: (localId: string) => void;
}) {
  return (
    <AnimatePresence initial={false}>
      {items.length > 0 && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="overflow-hidden"
        >
          <ul className="flex gap-2 px-2 pt-2 pb-1">
            <AnimatePresence initial={false}>
              {items.map((item) => (
                <motion.li
                  key={item.localId}
                  layout
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ type: "spring", stiffness: 420, damping: 30 }}
                  className="group relative size-16 shrink-0"
                  title={item.error}
                >
                  {/* Local object URL: shows instantly, before the upload ends. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.previewUrl}
                    alt=""
                    className={`size-full rounded-xl border object-cover ${
                      item.status === "error" ? "border-danger/60 opacity-50" : "border-white/10"
                    }`}
                  />

                  {(item.status === "processing" || item.status === "uploading") && (
                    <span className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/50">
                      <motion.span
                        className="size-5 rounded-full border-2 border-white/30 border-t-white"
                        animate={{ rotate: 360 }}
                        transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                      />
                    </span>
                  )}
                  {item.status === "error" && (
                    <span className="absolute inset-x-0 bottom-0 rounded-b-xl bg-danger/80 py-0.5 text-center text-[0.6rem] text-white">
                      erro
                    </span>
                  )}
                  {item.status === "ready" && item.attachment && (
                    <span className="absolute inset-x-0 bottom-0 rounded-b-xl bg-black/55 py-0.5 text-center font-mono text-[0.6rem] text-white/90 opacity-0 transition-opacity group-hover:opacity-100">
                      ~{item.attachment.tokens} tokens
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={() => onRemove(item.localId)}
                    aria-label="Remover imagem"
                    className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full border border-white/10 bg-surface-2 text-muted shadow transition-colors hover:text-foreground"
                  >
                    <CloseIcon className="size-3" />
                  </button>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
