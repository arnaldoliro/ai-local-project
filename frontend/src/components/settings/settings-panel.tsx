"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { BrainIcon, CheckIcon, CloseIcon, EyeIcon, WrenchIcon } from "@/components/icons";
import { ApiError, type ConversationSettings, type ModelInfo } from "@/lib/api";
import { useSettingsData } from "./settings-data";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Stored settings (null fields = default). */
  value: ConversationSettings;
  isNewChat: boolean;
  /** Throws ApiError when the server refuses (e.g. unknown model). */
  onSave: (next: ConversationSettings) => Promise<void>;
};

export function SettingsPanel(props: Props) {
  const { reloadModels } = useSettingsData();

  // Models may have been pulled since the page loaded.
  useEffect(() => {
    if (props.open) reloadModels();
  }, [props.open, reloadModels]);

  return (
    <AnimatePresence>
      {props.open && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={props.onClose}
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]"
          />
          <motion.aside
            key="panel"
            role="dialog"
            aria-label="Configurações da conversa"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 40 }}
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-white/8 bg-background shadow-2xl"
          >
            {/* Mounted on open, so the draft always starts from the saved values. */}
            <PanelBody {...props} />
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

const DEFAULT_SLIDER_TEMPERATURE = 0.7;

function PanelBody({ onClose, value, isNewChat, onSave }: Props) {
  const { models, defaults } = useSettingsData();
  const defaultModel = defaults?.model ?? "";

  const [model, setModel] = useState(value.model ?? defaultModel);
  const [systemPrompt, setSystemPrompt] = useState(value.systemPrompt ?? "");
  const [modelTemperature, setModelTemperature] = useState(value.temperature === null);
  const [temperature, setTemperature] = useState(value.temperature ?? DEFAULT_SLIDER_TEMPERATURE);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  // Escape closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const next: ConversationSettings = {
    // Picking the default model stores null: the conversation then follows
    // the configured default.
    model: model && model !== defaultModel ? model : null,
    systemPrompt: systemPrompt.trim() || null,
    temperature: modelTemperature ? null : round(temperature),
  };
  const dirty =
    next.model !== value.model || next.systemPrompt !== value.systemPrompt || next.temperature !== value.temperature;

  const maxLength = defaults?.systemPromptMaxLength ?? 2000;
  // Same heuristic as the backend (~3 characters per token).
  const promptTokens = Math.ceil((systemPrompt.trim() || defaults?.systemPrompt || "").length / 3);

  const save = async () => {
    setStatus("saving");
    setError(null);
    try {
      await onSave(next);
      setStatus("saved");
      setTimeout(onClose, 450);
    } catch (e) {
      setStatus("idle");
      setError(
        e instanceof ApiError && e.code === "unknown_model"
          ? "Esse modelo não está mais instalado no Ollama."
          : "Não foi possível salvar. O backend está rodando?",
      );
    }
  };

  return (
    <>
      <header className="flex items-start justify-between gap-4 border-b border-white/5 px-5 py-4">
        <div>
          <h2 className="text-base font-semibold">Configurações da conversa</h2>
          <p className="mt-0.5 text-xs text-muted">
            {isNewChat ? "Valem para esta nova conversa." : "Valem a partir da próxima mensagem."}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="rounded-lg p-1.5 text-muted transition-colors hover:bg-white/5 hover:text-foreground"
        >
          <CloseIcon className="size-4" />
        </button>
      </header>

      <div className="scroll-area flex-1 space-y-8 overflow-y-auto px-5 py-5">
        <Section title="Modelo">
          {models.length === 0 ? (
            <p className="text-sm text-muted">Nenhum modelo encontrado. O Ollama está rodando?</p>
          ) : (
            <div className="flex flex-col gap-2" role="radiogroup" aria-label="Modelo">
              {models.map((m) => (
                <ModelOption
                  key={m.name}
                  model={m}
                  selected={m.name === model}
                  isDefault={m.name === defaultModel}
                  onSelect={() => setModel(m.name)}
                />
              ))}
            </div>
          )}
          <p className="mt-3 text-xs leading-relaxed text-muted/80">
            Só um modelo cabe na GPU por vez: trocar faz a próxima resposta demorar mais, enquanto o novo
            modelo é carregado. Instale outros com{" "}
            <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[0.7rem]">ollama pull</code>.
          </p>
        </Section>

        <Section
          title="System prompt"
          action={
            systemPrompt && (
              <button type="button" onClick={() => setSystemPrompt("")} className="text-xs text-accent hover:underline">
                Usar o padrão
              </button>
            )
          }
        >
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            maxLength={maxLength}
            rows={6}
            placeholder={defaults?.systemPrompt}
            className="scroll-area w-full resize-y rounded-xl border border-white/8 bg-surface px-3 py-2.5 text-sm leading-relaxed outline-none transition-colors placeholder:text-muted/50 focus:border-accent/40"
          />
          <div className="mt-1.5 flex justify-between text-[0.7rem] text-muted/80">
            <span>{systemPrompt.trim() ? "Personalizado" : "Usando o padrão"}</span>
            <span>
              {systemPrompt.length}/{maxLength} · ~{promptTokens} tokens do contexto
            </span>
          </div>
        </Section>

        <Section title="Temperatura">
          <label className="flex cursor-pointer items-center justify-between gap-3 text-sm">
            <span className="text-muted">Usar o padrão do modelo</span>
            <Toggle checked={modelTemperature} onChange={setModelTemperature} />
          </label>

          <AnimatePresence initial={false}>
            {!modelTemperature && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="pt-4">
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs text-muted">{temperatureLabel(temperature)}</span>
                    <span className="font-mono text-sm tabular-nums">{temperature.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min={defaults?.temperature.min ?? 0}
                    max={defaults?.temperature.max ?? 2}
                    step={0.05}
                    value={temperature}
                    onChange={(e) => setTemperature(Number(e.target.value))}
                    aria-label="Temperatura"
                    className="range mt-2 w-full"
                  />
                  <div className="mt-1 flex justify-between text-[0.68rem] text-muted/70">
                    <span>Preciso</span>
                    <span>Criativo</span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <p className="mt-3 text-xs leading-relaxed text-muted/80">
            Valores baixos deixam as respostas mais previsíveis (bom para código e fatos); valores altos, mais
            variadas.
          </p>
        </Section>
      </div>

      <footer className="border-t border-white/5 px-5 py-4">
        <AnimatePresence>
          {error && (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-3 text-sm text-danger"
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-muted transition-colors hover:bg-white/5 hover:text-foreground"
          >
            Cancelar
          </button>
          <motion.button
            type="button"
            onClick={() => void save()}
            disabled={!dirty || status !== "idle"}
            whileTap={dirty ? { scale: 0.97 } : undefined}
            className="flex min-w-24 items-center justify-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white shadow-lg shadow-accent/20 transition-opacity disabled:opacity-40"
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={status}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
                className="flex items-center gap-1.5"
              >
                {status === "saved" && <CheckIcon className="size-4" />}
                {status === "saving" ? "Salvando…" : status === "saved" ? "Salvo" : "Salvar"}
              </motion.span>
            </AnimatePresence>
          </motion.button>
        </div>
      </footer>
    </>
  );
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[0.7rem] font-medium uppercase tracking-wider text-muted/70">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function ModelOption({
  model,
  selected,
  isDefault,
  onSelect,
}: {
  model: ModelInfo;
  selected: boolean;
  isDefault: boolean;
  onSelect: () => void;
}) {
  const details = [model.parameterSize, model.quantization, formatBytes(model.sizeBytes)].filter(Boolean).join(" · ");

  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`relative rounded-xl border px-4 py-3 text-left transition-colors ${
        selected ? "border-accent/50" : "border-white/8 hover:border-white/15"
      }`}
    >
      {selected && (
        <motion.span
          layoutId="selected-model"
          className="absolute inset-0 rounded-xl bg-accent/10"
          transition={{ type: "spring", stiffness: 420, damping: 36 }}
        />
      )}
      <span className="relative flex items-center justify-between gap-2">
        <span className="font-mono text-sm">{model.name}</span>
        {isDefault && <span className="rounded-full bg-white/8 px-2 py-0.5 text-[0.65rem] text-muted">padrão</span>}
      </span>
      <span className="relative mt-1 block text-xs text-muted">{details}</span>
      <span className="relative mt-2 flex flex-wrap gap-1.5">
        {model.capabilities.thinking && <Capability icon={<BrainIcon className="size-3" />} label="Raciocínio" />}
        {model.capabilities.vision && <Capability icon={<EyeIcon className="size-3" />} label="Imagens" />}
        {model.capabilities.tools && <Capability icon={<WrenchIcon className="size-3" />} label="Ferramentas" />}
      </span>
    </button>
  );
}

function Capability({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="flex items-center gap-1 rounded-full border border-white/8 px-2 py-0.5 text-[0.65rem] text-muted">
      {icon}
      {label}
    </span>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${checked ? "bg-accent" : "bg-white/15"}`}
    >
      <motion.span
        layout
        transition={{ type: "spring", stiffness: 600, damping: 35 }}
        className={`absolute top-0.5 size-4 rounded-full bg-white shadow ${checked ? "right-0.5" : "left-0.5"}`}
      />
    </button>
  );
}

const round = (n: number) => Math.round(n * 100) / 100;

function temperatureLabel(t: number): string {
  if (t <= 0.3) return "Preciso";
  if (t <= 0.9) return "Equilibrado";
  if (t <= 1.3) return "Criativo";
  return "Bem solto (pode divagar)";
}

function formatBytes(bytes: number): string | null {
  if (!bytes) return null;
  const gb = bytes / 1024 ** 3;
  return gb >= 1 ? `${gb.toFixed(1).replace(".", ",")} GB` : `${Math.round(bytes / 1024 ** 2)} MB`;
}
