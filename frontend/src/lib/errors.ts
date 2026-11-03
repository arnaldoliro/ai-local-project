/** Backend error codes -> messages shown to the user. */
const MESSAGES: Record<string, string> = {
  queue_full: "O modelo está ocupado com outras requisições. Tente de novo em instantes.",
  timeout_first_token: "O modelo demorou demais para começar a responder.",
  timeout_total: "A resposta passou do tempo máximo e foi interrompida.",
  unavailable: "Não foi possível falar com o Ollama. Ele está rodando?",
  model_not_found: "O modelo não foi encontrado no Ollama.",
  model_error: "O modelo retornou um erro.",
  aborted: "Resposta interrompida.",
  context_overflow: "A mensagem é grande demais para a janela de contexto do modelo.",
  network: "Sem conexão com o backend.",
};

export function errorMessage(code: string | undefined): string {
  return (code && MESSAGES[code]) || "Não foi possível gerar a resposta.";
}
