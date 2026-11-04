import type { ModelInfo } from '../llm.types.js';

/** One entry of GET /api/tags (Ollama 0.40 already includes capabilities). */
export interface OllamaTag {
  name: string;
  size?: number;
  details?: {
    family?: string;
    parameter_size?: string;
    quantization_level?: string;
  };
  capabilities?: string[];
}

export function toModelInfo(tag: OllamaTag): ModelInfo {
  const caps = new Set(tag.capabilities ?? []);
  return {
    name: tag.name,
    family: tag.details?.family ?? null,
    parameterSize: tag.details?.parameter_size ?? null,
    quantization: tag.details?.quantization_level ?? null,
    sizeBytes: tag.size ?? 0,
    capabilities: {
      completion: caps.has('completion'),
      vision: caps.has('vision'),
      tools: caps.has('tools'),
      thinking: caps.has('thinking'),
      embedding: caps.has('embedding'),
    },
  };
}
