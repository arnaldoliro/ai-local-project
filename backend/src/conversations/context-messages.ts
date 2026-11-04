/**
 * Messages the model is allowed to see: everything the user wrote and only
 * the answers that completed. Failed or aborted answers are not replayed as
 * if they were real replies. Shared by the chat history and the summarizer.
 */
export const CONTEXT_MESSAGE_FILTER = {
  OR: [
    { role: 'user' as const },
    { role: 'assistant' as const, status: 'complete' as const },
  ],
};
