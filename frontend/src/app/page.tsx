import { SystemStatus } from "@/components/system-status";

export default function Home() {
  return (
    <main className="relative flex flex-1 flex-col items-center justify-center gap-10 overflow-hidden px-6 py-16">
      <div aria-hidden className="glow pointer-events-none absolute -top-40 size-[36rem] rounded-full" />

      <header className="relative text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
          AI <span className="text-accent">Local</span>
        </h1>
        <p className="mt-3 text-sm text-muted">Chat com modelos do Ollama, 100% na sua máquina.</p>
      </header>

      <SystemStatus />
    </main>
  );
}
