"use client";

import { AnimatePresence, motion } from "motion/react";
import { useLayoutEffect, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent } from "react";
import { BrainIcon, ImageIcon, PaperclipIcon, SendIcon, StopIcon } from "@/components/icons";
import type { PendingAttachment } from "@/hooks/use-attachments";
import { AttachmentStrip } from "./attachment-strip";

const MAX_HEIGHT_PX = 200;

type Props = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  think: boolean;
  onThinkChange: (think: boolean) => void;
  /** False when the conversation's model has no thinking capability. */
  thinkSupported: boolean;
  streaming: boolean;
  error: string | null;
  onDismissError: () => void;
  attachments: PendingAttachment[];
  /** Uploads still running: sending waits for them. */
  attachmentsBusy: boolean;
  readyAttachments: number;
  onAddFiles: (files: File[]) => void;
  onRemoveAttachment: (localId: string) => void;
  /** False when the conversation's model can't see images. */
  visionSupported: boolean;
};

export function Composer(props: Props) {
  const { value, onChange, onSubmit, onStop, think, onThinkChange, thinkSupported, streaming, error, onDismissError } =
    props;
  const { attachments, attachmentsBusy, readyAttachments, onAddFiles, onRemoveAttachment, visionSupported } = props;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  // Text or at least one uploaded image; never while uploads are running.
  const canSend = (value.trim().length > 0 || readyAttachments > 0) && !attachmentsBusy && !streaming;

  const takeFiles = (files: FileList | File[] | null) => {
    if (!files || !visionSupported) return;
    const images = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (images.length) onAddFiles(images);
  };

  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const images = Array.from(event.clipboardData.files).filter((f) => f.type.startsWith("image/"));
    if (images.length && visionSupported) {
      event.preventDefault(); // don't paste the file name as text
      onAddFiles(images);
    }
  };

  const onDragOver = (event: DragEvent) => {
    if (!visionSupported || !event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    setDragging(true);
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    takeFiles(event.dataTransfer.files);
  };

  // Auto-grow up to MAX_HEIGHT_PX, then scroll inside.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`;
  }, [value]);

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // isComposing: don't send while an IME/accent composition is in progress.
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (canSend) onSubmit();
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-4 sm:px-6">
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 6, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: 6, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mb-2 flex items-center justify-between gap-3 rounded-xl border border-danger/30 bg-danger/10 px-4 py-2 text-sm text-danger">
              <span>{error}</span>
              <button type="button" onClick={onDismissError} className="text-xs opacity-70 hover:opacity-100">
                Fechar
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div
        onDragOver={onDragOver}
        onDragLeave={(e) => e.currentTarget.contains(e.relatedTarget as Node) || setDragging(false)}
        onDrop={onDrop}
        className={`composer relative rounded-2xl border bg-surface p-2 shadow-2xl shadow-black/40 transition-colors ${
          dragging ? "border-accent/60" : "border-white/8"
        }`}
      >
        <AnimatePresence>
          {dragging && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center gap-2 rounded-2xl bg-accent/10 text-sm text-foreground backdrop-blur-[1px]"
            >
              <ImageIcon className="size-5 text-accent" />
              Solte a imagem para anexar
            </motion.div>
          )}
        </AnimatePresence>

        <AttachmentStrip items={attachments} onRemove={onRemoveAttachment} />

        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          rows={1}
          placeholder="Pergunte qualquer coisa…"
          className="scroll-area block max-h-[200px] w-full resize-none bg-transparent px-3 py-2.5 text-[0.95rem] leading-relaxed text-foreground outline-none placeholder:text-muted/70"
          aria-label="Mensagem"
        />

        <div className="flex items-center justify-between px-1 pt-1">
          <div className="flex items-center gap-1">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                takeFiles(e.target.files);
                e.target.value = ""; // allow picking the same file again
              }}
            />
            <motion.button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={!visionSupported}
              whileTap={visionSupported ? { scale: 0.92 } : undefined}
              aria-label="Anexar imagem"
              title={
                visionSupported
                  ? "Anexar imagem (ou arraste e solte, ou cole com Ctrl+V)"
                  : "O modelo desta conversa não enxerga imagens"
              }
              className="rounded-full p-2 text-muted transition-colors hover:bg-white/5 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            >
              <PaperclipIcon className="size-4" />
            </motion.button>
            <motion.button
              type="button"
              onClick={() => onThinkChange(!think)}
              aria-pressed={think && thinkSupported}
              disabled={!thinkSupported}
              whileTap={thinkSupported ? { scale: 0.95 } : undefined}
              title={
                thinkSupported
                  ? "Liga o raciocínio do modelo só para a próxima mensagem (respostas mais lentas)"
                  : "O modelo desta conversa não tem raciocínio"
              }
              className={`relative flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                think ? "text-foreground" : "text-muted hover:text-foreground"
              }`}
            >
              {think && thinkSupported && (
                <motion.span
                  layoutId="think-pill"
                  className="absolute inset-0 rounded-full border border-accent/40 bg-accent/15"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
              <BrainIcon className="relative size-4" />
              <span className="relative">Raciocínio</span>
            </motion.button>
          </div>

          <motion.button
            type="button"
            onClick={streaming ? onStop : onSubmit}
            disabled={!streaming && !canSend}
            whileHover={streaming || canSend ? { scale: 1.06 } : undefined}
            whileTap={streaming || canSend ? { scale: 0.92 } : undefined}
            aria-label={streaming ? "Parar resposta" : "Enviar"}
            className={`flex size-9 items-center justify-center rounded-full transition-colors ${
              streaming
                ? "bg-foreground text-background"
                : canSend
                  ? "bg-accent text-white shadow-lg shadow-accent/30"
                  : "bg-white/5 text-muted"
            }`}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={streaming ? "stop" : "send"}
                initial={{ opacity: 0, rotate: -90, scale: 0.5 }}
                animate={{ opacity: 1, rotate: 0, scale: 1 }}
                exit={{ opacity: 0, rotate: 90, scale: 0.5 }}
                transition={{ duration: 0.15 }}
              >
                {streaming ? <StopIcon className="size-4" /> : <SendIcon className="size-4" />}
              </motion.span>
            </AnimatePresence>
          </motion.button>
        </div>
      </div>

      <p className="mt-2 text-center text-[0.7rem] text-muted/70">
        Enter envia · Shift+Enter quebra a linha · tudo roda na sua máquina
      </p>
    </div>
  );
}
