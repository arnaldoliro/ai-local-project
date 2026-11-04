import { Module } from '@nestjs/common';
import { EnvironmentVariables } from '../config/env.validation.js';
import { ContextBuilder } from './context-builder.js';

/** 10% of the window absorbs estimation error. */
const SAFETY_MARGIN_RATIO = 0.1;
/** Room for ~3 retrieved chunks of ~200 tokens each. */
const MEMORY_MAX_TOKENS = 600;

@Module({
  providers: [
    {
      provide: ContextBuilder,
      inject: [EnvironmentVariables],
      useFactory: (env: EnvironmentVariables) => {
        const builder = new ContextBuilder({
          contextWindow: env.LLM_CONTEXT_WINDOW,
          maxOutputTokens: env.LLM_MAX_OUTPUT_TOKENS,
          maxHistoryMessages: env.CONTEXT_MAX_HISTORY_MESSAGES,
          safetyMarginRatio: SAFETY_MARGIN_RATIO,
          memoryMaxTokens: MEMORY_MAX_TOKENS,
        });
        // Fail at startup, not on the first thinking message.
        if (builder.inputBudgetFor(env.LLM_MAX_OUTPUT_TOKENS_THINKING) <= 0) {
          throw new Error(
            'LLM_MAX_OUTPUT_TOKENS_THINKING leaves no room for the prompt',
          );
        }
        return builder;
      },
    },
  ],
  exports: [ContextBuilder],
})
export class ContextModule {}
