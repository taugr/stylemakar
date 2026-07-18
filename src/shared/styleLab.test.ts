import { describe, expect, it } from 'vitest';
import { DEFAULT_VOICE_PROFILE } from './defaults';
import {
  abandonCalibrationSession,
  confirmCalibrationSession,
  CURATED_VOICE_COMPARISONS,
  getComparisonById,
  recordCalibrationChoice,
  resetLearnedVoice,
  saveEditSuggestion,
  startCalibrationSession,
  suggestPreferencesFromEdit,
} from './styleLab';

function freshVoice() {
  return structuredClone(DEFAULT_VOICE_PROFILE);
}

describe('personal voice calibration', () => {
  it('builds a reviewable coach session and compiles confirmed preferences', () => {
    let voice = startCalibrationSession(freshVoice(), {
      mode: 'coach',
      now: '2026-07-18T00:00:00.000Z',
    });
    const sessionId = voice.calibrationSessions[0]!.id;

    for (const questionId of voice.calibrationSessions[0]!.questionIds) {
      voice = recordCalibrationChoice(
        voice,
        sessionId,
        getComparisonById(questionId)!,
        { selected: 'a' },
        '2026-07-18T00:01:00.000Z',
      );
    }

    expect(voice.calibrationSessions[0]?.status).toBe('review');
    expect(voice.preferences).toHaveLength(7);
    expect(voice.preferences.every((item) => item.status === 'tentative')).toBe(
      true,
    );
    expect(voice.rules).toEqual(DEFAULT_VOICE_PROFILE.rules);

    voice = confirmCalibrationSession(
      voice,
      sessionId,
      '2026-07-18T00:02:00.000Z',
    );

    expect(voice.calibrationSessions[0]?.status).toBe('completed');
    expect(voice.preferences.every((item) => item.status === 'confirmed')).toBe(
      true,
    );
    expect(voice.rules).toContain(
      'Lead with the main point or requested action.',
    );
    expect(voice.rules).toContain(DEFAULT_VOICE_PROFILE.manualRules[0]);
  });

  it('records tie and custom answers without inventing a rule', () => {
    let voice = startCalibrationSession(freshVoice(), {
      focus: 'directness',
      mode: 'fine-tune',
    });
    const session = voice.calibrationSessions[0]!;
    const comparison = getComparisonById(session.questionIds[0]!)!;

    voice = recordCalibrationChoice(voice, session.id, comparison, {
      customText:
        'Update the plan by Friday because the review found three problems.',
      selected: 'custom',
    });

    expect(voice.preferences).toHaveLength(0);
    expect(voice.preferenceEvidence[0]?.selected).toBe('custom');
    voice = confirmCalibrationSession(voice, session.id);
    expect(voice.examples.at(-1)?.text).toContain('Update the plan');
  });

  it('abandons tentative learning and can reset learned data safely', () => {
    let voice = startCalibrationSession(freshVoice(), {
      focus: 'warmth',
      mode: 'fine-tune',
    });
    const session = voice.calibrationSessions[0]!;
    voice = recordCalibrationChoice(
      voice,
      session.id,
      getComparisonById(session.questionIds[0]!)!,
      { selected: 'a' },
    );
    voice = abandonCalibrationSession(voice, session.id);

    expect(voice.preferences).toHaveLength(0);
    expect(voice.calibrationSessions[0]?.status).toBe('abandoned');

    voice = resetLearnedVoice(voice);
    expect(voice.manualRules).toEqual(DEFAULT_VOICE_PROFILE.manualRules);
    expect(voice.rules).toEqual(DEFAULT_VOICE_PROFILE.manualRules);
    expect(voice.calibrationSessions).toHaveLength(0);
  });

  it('strengthens a preference only when later evidence agrees', () => {
    let voice = startCalibrationSession(freshVoice(), {
      focus: 'warmth',
      mode: 'fine-tune',
    });
    let session = voice.calibrationSessions[0]!;
    const comparison = getComparisonById(session.questionIds[0]!)!;
    voice = recordCalibrationChoice(voice, session.id, comparison, {
      selected: 'a',
    });
    voice = confirmCalibrationSession(voice, session.id);
    expect(voice.preferences[0]?.confidence).toBe('low');

    voice = startCalibrationSession(voice, {
      focus: 'warmth',
      mode: 'fine-tune',
    });
    session = voice.calibrationSessions.at(-1)!;
    voice = recordCalibrationChoice(voice, session.id, comparison, {
      selected: 'a',
    });
    expect(voice.preferences.at(-1)?.confidence).toBe('medium');
  });

  it('turns explicit rewrite edits into reviewable, saveable suggestions', () => {
    const suggestions = suggestPreferencesFromEdit(
      'It may perhaps be helpful to leverage actionable insights in order to improve the process for the team.',
      'Use the findings to improve the process.',
    );

    expect(suggestions.map((item) => item.title)).toEqual(
      expect.arrayContaining(['Use fewer qualifiers', 'Prefer plain language']),
    );
    const voice = saveEditSuggestion(freshVoice(), suggestions[0]!);
    expect(voice.preferences[0]?.source).toBe('edit-suggestion');
    expect(voice.rules).toContain(suggestions[0]!.instruction);
  });

  it('ships one reviewed coach comparison for every supported core dimension', () => {
    expect(CURATED_VOICE_COMPARISONS).toHaveLength(7);
    expect(
      new Set(CURATED_VOICE_COMPARISONS.map((item) => item.dimension)).size,
    ).toBe(7);
    for (const comparison of CURATED_VOICE_COMPARISONS) {
      expect(comparison.candidateA.text).not.toBe(comparison.candidateB.text);
      expect(comparison.preservedDetails.length).toBeGreaterThanOrEqual(3);
    }
  });
});
