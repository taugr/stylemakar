import { describe, expect, it } from 'vitest';
import { selectGemmaModel } from './modelSelection';

describe('selectGemmaModel', () => {
  it('prefers Gemma 4 models when available', () => {
    expect(
      selectGemmaModel(['qwen3-14b', 'google/gemma-4-12b-it', 'gemma-2']),
    ).toBe('google/gemma-4-12b-it');
  });

  it('falls back to the preferred configured model', () => {
    expect(selectGemmaModel(['qwen3-14b'], 'custom-model')).toBe(
      'custom-model',
    );
  });
});
