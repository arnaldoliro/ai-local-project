/**
 * Base URL of the NestJS API as seen from the browser.
 * NEXT_PUBLIC_ variables are inlined into the client bundle, so this must be
 * an address the *browser* can reach (127.0.0.1), not the compose hostname.
 */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3001";

export type DependencyStatus = { ok: boolean; detail?: string };

export type HealthResponse = {
  status: "ok" | "degraded";
  database: DependencyStatus;
  ollama: DependencyStatus;
  contextWindow: number;
  defaultModel: string;
};

export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const response = await fetch(`${API_URL}/health`, { signal, cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as HealthResponse;
}
