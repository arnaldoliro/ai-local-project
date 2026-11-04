/**
 * Token estimation without a tokenizer.
 *
 * Why a heuristic: Ollama has no public tokenize endpoint, and libraries like
 * tiktoken use OpenAI's vocabulary, not Qwen's, so they would add a
 * dependency and still be wrong. Qwen-family tokenizers average roughly
 * 3.5–4.5 characters per token for Portuguese/English prose and less for
 * code. Dividing by 3 overestimates on purpose: sending slightly less history
 * is harmless, overflowing the window is not (Ollama silently truncates the
 * beginning of the prompt, which is where the system prompt lives).
 *
 * The real `prompt_eval_count` of every response is logged next to this
 * estimate, so the constant can be calibrated with data.
 */
export const CHARS_PER_TOKEN = 3;

/** Chat-template tokens around each message (`<|im_start|>role\n…<|im_end|>\n`). */
export const MESSAGE_OVERHEAD_TOKENS = 8;

/** Tokens the template adds to prime the assistant's answer. */
export const PROMPT_OVERHEAD_TOKENS = 4;

export function estimateTextTokens(text: string): number {
  return text ? Math.ceil(text.length / CHARS_PER_TOKEN) : 0;
}

export function estimateMessageTokens(content: string): number {
  return estimateTextTokens(content) + MESSAGE_OVERHEAD_TOKENS;
}

/** Cuts text to roughly `tokens` tokens, marking the cut with an ellipsis. */
export function truncateToTokens(text: string, tokens: number): string {
  const maxChars = Math.max(0, tokens) * CHARS_PER_TOKEN;
  return text.length <= maxChars
    ? text
    : `${text.slice(0, maxChars).trimEnd()}…`;
}
