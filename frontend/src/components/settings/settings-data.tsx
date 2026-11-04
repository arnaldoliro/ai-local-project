"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { fetchModels, fetchSettingsDefaults, type ModelInfo, type SettingsDefaults } from "@/lib/api";

type SettingsData = {
  models: ModelInfo[];
  defaults: SettingsDefaults | null;
  /** Re-reads the installed models (e.g. after `ollama pull`). */
  reloadModels: () => void;
  findModel: (name: string) => ModelInfo | undefined;
};

const Context = createContext<SettingsData | null>(null);

/** Installed models + server defaults, shared by the header, panel and composer. */
export function SettingsDataProvider({ children }: { children: ReactNode }) {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [defaults, setDefaults] = useState<SettingsDefaults | null>(null);
  const [modelsVersion, setModelsVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetchSettingsDefaults(controller.signal).then(setDefaults, () => {});
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchModels(controller.signal).then(({ models }) => setModels(models), () => {});
    return () => controller.abort();
  }, [modelsVersion]);

  const reloadModels = useCallback(() => setModelsVersion((v) => v + 1), []);
  const findModel = useCallback((name: string) => models.find((m) => m.name === name), [models]);

  const value = useMemo(
    () => ({ models, defaults, reloadModels, findModel }),
    [models, defaults, reloadModels, findModel],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useSettingsData(): SettingsData {
  const context = useContext(Context);
  if (!context) throw new Error("useSettingsData must be used inside SettingsDataProvider");
  return context;
}
