"use client";

import { AnimatePresence, motion } from "motion/react";
import { useLayoutEffect, useRef, type KeyboardEvent } from "react";
import { BrainIcon, SendIcon, StopIcon } from "@/components/icons";

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
};

export function Composer(props: Props) {
  const { value, onChange, onSubmit, onStop, think, onThinkChange, thinkSupported, streaming, error, onDismissError } =
    props;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const canSend = value.trim().length > 0 && !streaming;

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

      <div className="composer rounded-2xl border border-white/8 bg-surface p-2 shadow-2xl shadow-black/40">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder="Pergunte qualquer coisa…"
          className="scroll-area block max-h-[200px] w-full resize-none bg-transparent px-3 py-2.5 text-[0.95rem] leading-relaxed text-foreground outline-none placeholder:text-muted/70"
          aria-label="Mensagem"
        />

        <div className="flex items-center justify-between px-1 pt-1">
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
