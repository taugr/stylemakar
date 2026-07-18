import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_PROVIDER, DEFAULT_STYLE_PROFILE } from '../shared/defaults';
import {
  generateAdaptiveVoiceComparison,
  validateAdaptiveComparisonRequest,
} from './styleLab';

const request = {
  dimension: 'warmth' as const,
  preservedDetails: ['Tuesday', 'two reviewers'],
  provider: DEFAULT_PROVIDER,
  sourceText:
    'The meeting moved to Tuesday because two reviewers are unavailable.',
  voice: DEFAULT_STYLE_PROFILE,
};

describe('adaptive Style Lab comparison service', () => {
  it('generates a pair and blocks it unless both meaning checks pass', async () => {
    const client = vi
      .fn()
      .mockResolvedValueOnce({
        candidateA: {
          instruction: 'Use warm language.',
          text: "Let's meet Tuesday; two reviewers are unavailable before then.",
        },
        candidateB: {
          instruction: 'Use neutral language.',
          text: 'The meeting is Tuesday because two reviewers are unavailable.',
        },
      })
      .mockResolvedValueOnce({
        candidateA: { pass: true, risks: [] },
        candidateB: { pass: true, risks: [] },
      });

    const result = await generateAdaptiveVoiceComparison(request, client);
    expect(result.source).toBe('generated');
    expect(result.meaningCheck).toEqual({
      candidateA: true,
      candidateB: true,
      risks: [],
    });
    expect(client).toHaveBeenCalledTimes(2);
  });

  it('rejects unsafe or malformed generated pairs', async () => {
    const client = vi
      .fn()
      .mockResolvedValueOnce({
        candidateA: { instruction: 'Warm.', text: 'Meet Tuesday.' },
        candidateB: {
          instruction: 'Neutral.',
          text: 'The meeting is Tuesday.',
        },
      })
      .mockResolvedValueOnce({
        candidateA: { pass: false, risks: ['Removed two reviewers.'] },
        candidateB: { pass: true, risks: [] },
      })
      .mockResolvedValueOnce({
        candidateA: { instruction: 'Warm.', text: 'Meet Tuesday.' },
        candidateB: {
          instruction: 'Neutral.',
          text: 'The meeting is Tuesday.',
        },
      })
      .mockResolvedValueOnce({
        candidateA: { pass: false, risks: ['Removed two reviewers.'] },
        candidateB: { pass: true, risks: [] },
      });

    await expect(
      generateAdaptiveVoiceComparison(request, client),
    ).rejects.toThrow('meaning preservation');
  });

  it('requires explicit preserved details', () => {
    expect(() =>
      validateAdaptiveComparisonRequest({ ...request, preservedDetails: [] }),
    ).toThrow('preserved meaning details');
  });
});
