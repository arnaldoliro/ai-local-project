"use client";

import { AnimatePresence, motion } from "motion/react";
import type { ChatPhase } from "@/hooks/use-chat";

function label(phase: ChatPhase): string {
  switch (phase.kind) {
    case "queued":
      return `Na fila · ${phase.position} na frente`;
    case "loading_model":
      return "Carregando o modelo na memória… a primeira resposta pode levar cerca de 1 minuto";
    case "generating":
      return "Gerando resposta…";
    default:
      return "Enviando…";
  }
}

/** Shown in place of the answer until the first token arrives. */
export function StreamStatus({ phase }: { phase: ChatPhase }) {
  const text = label(phase);

  return (
    <div className="flex items-center gap-3 py-1 text-sm text-muted" role="status">
      <span className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="size-1.5 rounded-full bg-accent"
            animate={{ opacity: [0.25, 1, 0.25], y: [0, -3, 0] }}
            transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }}
          />
        ))}
      </span>
      <AnimatePresence mode="wait">
        <motion.span
          key={text}
          initial={{ opacity: 0, x: -4 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 4 }}
          transition={{ duration: 0.2 }}
        >
          {text}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}
