"use client";

import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { SlidersIcon } from "@/components/icons";
import { fetchHealth, type HealthResponse } from "@/lib/api";

type State = { kind: "loading" } | { kind: "ready"; health: HealthResponse } | { kind: "offline" };

/**
 * Header button: health dot + the conversation's model. Opens the settings
 * panel. The dot turns red when the backend, database or Ollama is down.
 */
export function StatusIndicator({ model, onClick }: { model: string | null; onClick: () => void }) {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    fetchHealth(controller.signal).then(
      (health) => setState({ kind: "ready", health }),
      () => {
        if (!controller.signal.aborted) setState({ kind: "offline" });
      },
    );
    return () => controller.abort();
  }, []);

  const ok = state.kind === "ready" && state.health.status === "ok";
  const color = state.kind === "loading" ? "bg-muted" : ok ? "bg-success" : "bg-danger";
  const health =
    state.kind === "ready"
      ? [
          `Banco: ${state.health.database.detail ?? "?"}`,
          `Ollama: ${state.health.ollama.detail ?? "?"}`,
          `Memória: ${state.health.embeddings?.ok ? state.health.embeddings.detail : "indisponível"}`,
          `Contexto: ${state.health.contextWindow} tokens`,
        ].join(" · ")
      : state.kind === "offline"
        ? "Backend indisponível"
        : "Verificando…";

  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.96 }}
      title={`${health}\nClique para configurar a conversa`}
      className="flex items-center gap-2 rounded-full border border-white/6 bg-surface px-3 py-1 text-xs text-muted transition-colors hover:border-accent/40 hover:text-foreground"
    >
      <span className="relative flex size-2">
        {ok && (
          <motion.span
            className={`absolute inset-0 rounded-full ${color}`}
            animate={{ scale: [1, 2.4], opacity: [0.5, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
          />
        )}
        <span className={`relative size-2 rounded-full ${color}`} />
      </span>
      <span className="max-w-[9rem] truncate font-mono">{state.kind === "offline" ? "offline" : (model ?? "…")}</span>
      <SlidersIcon className="size-3.5" />
    </motion.button>
  );
}
