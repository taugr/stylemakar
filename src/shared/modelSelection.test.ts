import { describe, expect, it } from 'vitest';
import { filterChatModelIds, selectAvailableModel } from './modelSelection';

describe('selectAvailableModel', () => {
  it('preserves an available configured model', () => {
    expect(
      selectAvailableModel(
        ['google/gemma-4-e4b', 'google/gemma-4-12b-qat'],
        'google/gemma-4-12b-qat',
      ),
    ).toBe('google/gemma-4-12b-qat');
  });

  it('does not silently replace a missing configured model', () => {
    expect(selectAvailableModel(['qwen3-14b'], 'custom-model')).toBeUndefined();
  });

  it('prefers a QAT Gemma 4 model when no model is configured', () => {
    expect(
      selectAvailableModel(['google/gemma-4-e4b', 'google/gemma-4-12b-qat']),
    ).toBe('google/gemma-4-12b-qat');
  });

  it('excludes embedding-only models from chat suggestions', () => {
    expect(
      filterChatModelIds([
        'text-embedding-nomic-embed-text-v1.5',
        'google/gemma-4-12b-qat',
      ]),
    ).toEqual(['google/gemma-4-12b-qat']);
  });
});
