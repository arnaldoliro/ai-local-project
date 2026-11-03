"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { fetchHealth, type HealthResponse } from "@/lib/api";

type State =
  | { kind: "loading" }
  | { kind: "ready"; health: HealthResponse }
  | { kind: "offline"; error: string };

export function SystemStatus() {
  const [state, setState] = useState<State>({ kind: "loading" });
  // Bumping this re-runs the effect, which is how "check again" works.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetchHealth(controller.signal).then(
      (health) => setState({ kind: "ready", health }),
      (error: Error) => {
        if (!controller.signal.aborted) setState({ kind: "offline", error: error.message });
      },
    );
    return () => controller.abort();
  }, [attempt]);

  const retry = () => {
    setState({ kind: "loading" });
    setAttempt((n) => n + 1);
  };

  const health = state.kind === "ready" ? state.health : undefined;
  const items = [
    {
      label: "Backend",
      ok: state.kind === "ready",
      detail: state.kind === "offline" ? state.error : "NestJS",
    },
    { label: "Banco de dados", ok: health?.database.ok, detail: health?.database.detail },
    { label: "Ollama", ok: health?.ollama.ok, detail: health?.ollama.detail },
  ];

  return (
    <section className="w-full max-w-md">
      <ul className="flex flex-col gap-3">
        {items.map((item, index) => (
          <motion.li
            key={item.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 + index * 0.08, type: "spring", stiffness: 260, damping: 24 }}
            className="flex items-center gap-4 rounded-2xl border border-white/5 bg-surface px-5 py-4"
          >
            <StatusDot ok={state.kind === "loading" ? undefined : Boolean(item.ok)} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">{item.label}</p>
              <AnimatePresence mode="wait">
                <motion.p
                  key={item.detail ?? "…"}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="truncate font-mono text-xs text-muted"
                >
                  {state.kind === "loading" ? "verificando…" : (item.detail ?? "indisponível")}
                </motion.p>
              </AnimatePresence>
            </div>
          </motion.li>
        ))}
      </ul>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="mt-6 flex items-center justify-between text-xs text-muted"
      >
        <span className="font-mono">
          {health ? `${health.defaultModel} · ${health.contextWindow} tokens` : " "}
        </span>
        <motion.button
          type="button"
          onClick={retry}
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.96 }}
          className="rounded-full border border-white/10 px-4 py-1.5 text-foreground transition-colors hover:border-accent/60"
        >
          Verificar de novo
        </motion.button>
      </motion.div>
    </section>
  );
}

function StatusDot({ ok }: { ok: boolean | undefined }) {
  const color = ok === undefined ? "bg-muted" : ok ? "bg-success" : "bg-danger";

  return (
    <span className="relative flex size-3">
      {ok && (
        <motion.span
          className={`absolute inset-0 rounded-full ${color}`}
          animate={{ scale: [1, 2.2], opacity: [0.6, 0] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
        />
      )}
      <motion.span
        layout
        className={`relative size-3 rounded-full ${color}`}
        animate={ok === undefined ? { opacity: [0.3, 1, 0.3] } : { opacity: 1 }}
        transition={ok === undefined ? { duration: 1.2, repeat: Infinity } : {}}
      />
    </span>
  );
}
