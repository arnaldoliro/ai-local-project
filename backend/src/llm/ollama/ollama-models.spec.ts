import { toModelInfo } from './ollama-models.js';

describe('toModelInfo', () => {
  it('maps an /api/tags entry, capabilities included', () => {
    const info = toModelInfo({
      name: 'qwen3.5:2b',
      size: 2683396812,
      details: {
        family: 'qwen35',
        parameter_size: '1.9B',
        quantization_level: 'Q8_0',
      },
      capabilities: ['completion', 'vision', 'tools', 'thinking'],
    });

    expect(info).toEqual({
      name: 'qwen3.5:2b',
      family: 'qwen35',
      parameterSize: '1.9B',
      quantization: 'Q8_0',
      sizeBytes: 2683396812,
      capabilities: {
        completion: true,
        vision: true,
        tools: true,
        thinking: true,
        embedding: false,
      },
    });
  });

  it('tolerates missing fields (older Ollama versions)', () => {
    const info = toModelInfo({ name: 'nomic-embed-text' });

    expect(info.capabilities.completion).toBe(false);
    expect(info.family).toBeNull();
    expect(info.sizeBytes).toBe(0);
  });
});
