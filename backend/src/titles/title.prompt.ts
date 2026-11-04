import { truncateToTokens } from '../context/token-estimator.js';

/** A title is ~6 words; this is plenty and bounds the cost of a bad answer. */
export const TITLE_MAX_OUTPUT_TOKENS = 24;
export const TITLE_MAX_LENGTH = 60;
/** Only the start of the exchange is needed to name it. */
const EXCERPT_TOKENS = 200;

export const TITLE_SYSTEM_PROMPT =
  'Crie um título curto para a conversa a seguir: no máximo 6 palavras, em ' +
  'português do Brasil, descrevendo o assunto. Responda apenas com o título, ' +
  'sem aspas, sem pontuação no final e sem explicações.';

export function buildTitlePrompt(
  userText: string,
  assistantText: string,
): string {
  return (
    `Usuário: ${truncateToTokens(userText, EXCERPT_TOKENS)}\n\n` +
    `Assistente: ${truncateToTokens(assistantText, EXCERPT_TOKENS)}`
  );
}

/**
 * Small models don't always follow "only the title": they add quotes, a
 * "Título:" prefix, markdown or a trailing period. Clean all of that up.
 * Returns null when nothing usable is left.
 */
export function sanitizeTitle(raw: string): string | null {
  const firstLine =
    raw
      .split('\n')
      .map((line) => line.trim())
      .find(Boolean) ?? '';

  let title = firstLine
    .replace(/^(t[íi]tulo|title)\s*:\s*/i, '')
    .replace(/[*_`#]+/g, '')
    // Quotes and final punctuation can come in any order ("Title". / "Title.")
    .replace(/^["'“”‘’«»\s]+/, '')
    .replace(/["'“”‘’«».:;,!\s]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (title.length > TITLE_MAX_LENGTH) {
    const cut = title.slice(0, TITLE_MAX_LENGTH);
    const lastSpace = cut.lastIndexOf(' ');
    title = `${(lastSpace > 20 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
  }

  return title || null;
}
