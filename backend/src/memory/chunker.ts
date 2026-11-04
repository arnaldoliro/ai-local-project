/**
 * ~600 characters ≈ 200 estimated tokens. Small chunks retrieve precisely
 * (one idea per vector) and several fit in the memory quota of a prompt.
 */
export const CHUNK_MAX_CHARS = 600;
/** Overlap keeps a sentence that straddles a cut findable from both sides. */
export const CHUNK_OVERLAP_CHARS = 100;

/** The unit of memory: what was asked and what was answered. */
export function buildExchangeText(user: string, assistant: string): string {
  return [
    user.trim() && `Usuário: ${user.trim()}`,
    assistant.trim() && `Assistente: ${assistant.trim()}`,
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Splits text into chunks of at most `maxChars`, preferring to cut at a
 * paragraph, then a sentence, then a space; never mid-word unless a single
 * word is longer than the chunk. Consecutive chunks overlap by `overlap`.
 */
export function chunkText(
  text: string,
  maxChars = CHUNK_MAX_CHARS,
  overlap = CHUNK_OVERLAP_CHARS,
): string[] {
  const clean = text.replace(/\n{3,}/g, '\n\n').trim();
  if (!clean) return [];
  if (clean.length <= maxChars) return [clean];

  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(start + maxChars, clean.length);
    if (end < clean.length) end = bestCut(clean, start, end);

    chunks.push(clean.slice(start, end).trim());
    if (end >= clean.length) break;

    // Step back for the overlap, but always move forward.
    const next = end - overlap;
    start = next > start ? alignToWord(clean, next) : end;
  }
  return chunks.filter(Boolean);
}

/** Latest good boundary in the second half of [start, end). */
function bestCut(text: string, start: number, end: number): number {
  const window = text.slice(start, end);
  const minCut = Math.floor(window.length / 2);
  for (const separator of ['\n\n', '\n', '. ', '! ', '? ', '; ', ', ', ' ']) {
    const at = window.lastIndexOf(separator);
    if (at >= minCut) return start + at + separator.length;
  }
  return end; // one huge "word": hard cut
}

/** Moves a start position to the beginning of the next word. */
function alignToWord(text: string, position: number): number {
  const space = text.indexOf(' ', position);
  return space === -1 ? position : space + 1;
}
