"use client";

import { motion } from "motion/react";

const SUGGESTIONS = [
  "Explique o que é uma janela de contexto em LLMs",
  "Escreva uma função TypeScript que valida CPF",
  "Compare REST e GraphQL em uma tabela",
  "Me dê 3 ideias de projetos para portfólio",
];

export function EmptyState({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden px-6">
      <div aria-hidden className="glow pointer-events-none absolute top-[10%] size-[32rem] rounded-full" />

      <motion.h1
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 200, damping: 24 }}
        className="relative text-center text-3xl font-semibold tracking-tight sm:text-4xl"
      >
        Como posso ajudar?
      </motion.h1>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="relative mt-3 text-center text-sm text-muted"
      >
        Um modelo local, sem nada saindo da sua máquina.
      </motion.p>

      <div className="relative mt-10 grid w-full max-w-2xl gap-3 sm:grid-cols-2">
        {SUGGESTIONS.map((text, index) => (
          <motion.button
            key={text}
            type="button"
            onClick={() => onPick(text)}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 + index * 0.06, type: "spring", stiffness: 260, damping: 24 }}
            whileHover={{ y: -2 }}
            className="rounded-2xl border border-white/6 bg-surface/70 px-4 py-3 text-left text-sm text-muted backdrop-blur transition-colors hover:border-accent/40 hover:text-foreground"
          >
            {text}
          </motion.button>
        ))}
      </div>
    </div>
  );
}
