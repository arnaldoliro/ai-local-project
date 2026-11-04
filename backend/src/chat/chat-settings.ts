import type { ModelCapabilities } from '../llm/llm.types.js';

/** Kept short on purpose: every token here is taken from the history budget. */
export const DEFAULT_SYSTEM_PROMPT =
  'Você é um assistente prestativo rodando localmente. Responda em português ' +
  'do Brasil, de forma clara e direta. Use markdown quando ajudar: listas, ' +
  'tabelas e blocos de código com a linguagem indicada.';

/** ~670 estimated tokens: a long prompt eats the history budget. */
export const SYSTEM_PROMPT_MAX_LENGTH = 2000;
export const TEMPERATURE_MIN = 0;
export const TEMPERATURE_MAX = 2;

/** What a conversation stores. null = "use the default". */
export interface ConversationSettings {
  model: string | null;
  systemPrompt: string | null;
  temperature: number | null;
}

export interface SettingsDefaults {
  model: string;
  systemPrompt: string;
  maxOutputTokens: number;
  maxOutputTokensThinking: number;
}

export interface ResolvedSettings {
  model: string;
  systemPrompt: string;
  /** undefined = let the model use its own default (from its Modelfile). */
  temperature?: number;
  /** undefined = the model can't think, so the parameter is not sent. */
  think?: boolean;
  maxOutputTokens: number;
}

/**
 * Turns stored settings + the per-message thinking toggle into what is
 * actually sent. `capabilities` is null when unknown (model not found in
 * the list): then thinking is assumed possible and Ollama has the last word.
 */
export function resolveChatSettings(
  settings: ConversationSettings,
  defaults: SettingsDefaults,
  wantsThink: boolean,
  capabilities: ModelCapabilities | null,
): ResolvedSettings {
  const canThink = capabilities?.thinking ?? true;
  const think = canThink ? wantsThink : undefined;

  return {
    model: settings.model ?? defaults.model,
    systemPrompt: settings.systemPrompt?.trim() || defaults.systemPrompt,
    temperature: settings.temperature ?? undefined,
    think,
    // Reasoning tokens count as output: thinking gets the bigger reserve.
    maxOutputTokens: think
      ? defaults.maxOutputTokensThinking
      : defaults.maxOutputTokens,
  };
}

/** For background calls (title, summary): never think, if the model can. */
export function noThinking(
  capabilities: ModelCapabilities | null,
): false | undefined {
  return (capabilities?.thinking ?? true) ? false : undefined;
}
