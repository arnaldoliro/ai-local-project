import type { SummarizableMessage } from './summary-planner.js';

/** Max tokens the model may write for a summary (num_predict). */
export const SUMMARY_MAX_OUTPUT_TOKENS = 384;

export const SUMMARY_SYSTEM_PROMPT =
  'Você resume conversas entre um usuário e um assistente de IA. O resumo ' +
  'será a memória do assistente sobre o início da conversa, então preserve ' +
  'fatos, decisões, preferências do usuário, nomes, números e perguntas em ' +
  'aberto. Escreva em português do Brasil, em tópicos curtos, com no máximo ' +
  '150 palavras. Não invente nada e não comente sobre o próprio resumo.';

const speaker = (role: SummarizableMessage['role']) =>
  role === 'user' ? 'Usuário' : 'Assistente';

/** Incremental: the previous summary plus the new messages -> one summary. */
export function buildSummaryPrompt(
  previousSummary: string | null,
  messages: SummarizableMessage[],
): string {
  const transcript = messages
    .map((m) => `${speaker(m.role)}: ${m.content}`)
    .join('\n\n');

  return [
    previousSummary ? `Resumo anterior:\n${previousSummary}` : null,
    `Novas mensagens:\n${transcript}`,
    previousSummary
      ? 'Escreva o resumo atualizado, combinando o resumo anterior com as novas mensagens.'
      : 'Escreva o resumo dessas mensagens.',
  ]
    .filter(Boolean)
    .join('\n\n');
}
