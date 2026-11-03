"use client";

import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { fetchHealth, type HealthResponse } from "@/lib/api";

type State = { kind: "loading" } | { kind: "ready"; health: HealthResponse } | { kind: "offline" };

/** Compact health badge: model name + a dot that turns red when something is down. */
export function StatusIndicator() {
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
  const title =
    state.kind === "ready"
      ? `Banco: ${state.health.database.detail ?? "?"} · Ollama: ${state.health.ollama.detail ?? "?"} · contexto ${state.health.contextWindow} tokens`
      : state.kind === "offline"
        ? "Backend indisponível"
        : "Verificando…";

  return (
    <div title={title} className="flex items-center gap-2 rounded-full border border-white/6 bg-surface px-3 py-1 text-xs text-muted">
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
      <span className="font-mono">
        {state.kind === "ready" ? state.health.defaultModel : state.kind === "offline" ? "offline" : "…"}
      </span>
    </div>
  );
}
