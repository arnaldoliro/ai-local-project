export type LlmErrorCode =
  | 'queue_full'
  | 'timeout_first_token'
  | 'timeout_total'
  | 'aborted'
  | 'unavailable'
  | 'model_not_found'
  | 'model_error';

/**
 * Single error type for everything that can go wrong around a model call.
 * The `code` is stable and sent to the frontend, which maps it to a message.
 */
export class LlmError extends Error {
  constructor(
    readonly code: LlmErrorCode,
    message: string = code,
  ) {
    super(message);
    this.name = 'LlmError';
  }
}
