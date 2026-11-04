import type { ModelCapabilities } from '../llm/llm.types.js';
import {
  noThinking,
  resolveChatSettings,
  type SettingsDefaults,
} from './chat-settings.js';

const defaults: SettingsDefaults = {
  model: 'default-model',
  systemPrompt: 'default prompt',
  maxOutputTokens: 1024,
  maxOutputTokensThinking: 2048,
};

const caps = (thinking: boolean): ModelCapabilities => ({
  completion: true,
  vision: false,
  tools: false,
  thinking,
  embedding: false,
});

const empty = { model: null, systemPrompt: null, temperature: null };

describe('resolveChatSettings', () => {
  it('falls back to the defaults when nothing is set', () => {
    expect(resolveChatSettings(empty, defaults, false, caps(true))).toEqual({
      model: 'default-model',
      systemPrompt: 'default prompt',
      temperature: undefined,
      think: false,
      maxOutputTokens: 1024,
    });
  });

  it('uses the conversation settings when present', () => {
    const resolved = resolveChatSettings(
      { model: 'other', systemPrompt: '  be brief  ', temperature: 0.2 },
      defaults,
      false,
      caps(true),
    );

    expect(resolved).toMatchObject({
      model: 'other',
      systemPrompt: 'be brief',
      temperature: 0.2,
    });
  });

  it('treats a blank system prompt as "use the default"', () => {
    const resolved = resolveChatSettings(
      { ...empty, systemPrompt: '   ' },
      defaults,
      false,
      caps(true),
    );

    expect(resolved.systemPrompt).toBe('default prompt');
  });

  it('keeps temperature 0 (it is a real value, not "unset")', () => {
    const resolved = resolveChatSettings(
      { ...empty, temperature: 0 },
      defaults,
      false,
      caps(true),
    );

    expect(resolved.temperature).toBe(0);
  });

  it('gives thinking the bigger output reserve', () => {
    const resolved = resolveChatSettings(empty, defaults, true, caps(true));

    expect(resolved).toMatchObject({ think: true, maxOutputTokens: 2048 });
  });

  it('does not send think at all to a model that cannot think', () => {
    const resolved = resolveChatSettings(empty, defaults, true, caps(false));

    expect(resolved.think).toBeUndefined();
    expect(resolved.maxOutputTokens).toBe(1024);
  });

  it('assumes thinking is possible when capabilities are unknown', () => {
    expect(resolveChatSettings(empty, defaults, true, null).think).toBe(true);
  });
});

describe('noThinking', () => {
  it('sends false to thinking models and nothing to the others', () => {
    expect(noThinking(caps(true))).toBe(false);
    expect(noThinking(caps(false))).toBeUndefined();
    expect(noThinking(null)).toBe(false);
  });
});
