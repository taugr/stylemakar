import type {
  AdaptiveVoiceComparisonResponse,
  VoiceCalibrationProof,
  StyleProfile,
  VoiceCalibrationSession,
  VoicePreference,
  VoicePreferenceDimension,
  VoicePreferenceEvidence,
  VoiceProfileRecord,
} from './types';

export type ComparisonCandidate = {
  text: string;
  instruction: string;
  avoidInstruction?: string;
};

export type CuratedVoiceComparison = {
  id: string;
  dimension: VoicePreferenceDimension;
  sourceText: string;
  candidateA: ComparisonCandidate;
  candidateB: ComparisonCandidate;
  preservedDetails: string[];
};

export type VoiceComparison =
  | CuratedVoiceComparison
  | AdaptiveVoiceComparisonResponse;

export type CalibrationChoice =
  | { selected: 'a' | 'b' | 'tie' | 'neither' }
  | { selected: 'custom'; customText: string };

export type VoiceEditSuggestion = {
  id: string;
  dimension: VoicePreferenceDimension;
  title: string;
  description: string;
  instruction: string;
  avoidInstruction?: string;
  before: string;
  after: string;
};

export const CALIBRATION_PROOF_SOURCE =
  'Our platform uses advanced artificial intelligence to help teams streamline their workflows and make better decisions. It provides actionable insights while preserving the important details in the original material.';

export const CURATED_VOICE_COMPARISONS: ReadonlyArray<CuratedVoiceComparison> =
  [
    {
      id: 'directness-01',
      dimension: 'directness',
      sourceText:
        'The review found three problems, so the team should update the release plan before Friday.',
      candidateA: {
        text: 'Update the release plan before Friday. The review found three problems.',
        instruction: 'Lead with the main point or requested action.',
        avoidInstruction: 'Avoid long scene-setting before the main point.',
      },
      candidateB: {
        text: 'The review found three problems. Because of that, the team should update the release plan before Friday.',
        instruction: 'Give the reason or context before the main action.',
        avoidInstruction:
          'Do not open with a conclusion before establishing context.',
      },
      preservedDetails: ['three problems', 'update the release plan', 'Friday'],
    },
    {
      id: 'warmth-01',
      dimension: 'warmth',
      sourceText:
        'The draft is clearer now, but the opening still needs a more specific claim.',
      candidateA: {
        text: 'This is much clearer. One more change will help: make the opening claim more specific.',
        instruction: 'Use warm, encouraging language while staying specific.',
        avoidInstruction:
          'Avoid sounding detached when giving constructive guidance.',
      },
      candidateB: {
        text: 'The draft is clearer. Make the opening claim more specific.',
        instruction: 'Use a neutral, matter-of-fact tone.',
        avoidInstruction:
          'Avoid extra encouragement when a direct note is enough.',
      },
      preservedDetails: ['draft is clearer', 'opening', 'more specific claim'],
    },
    {
      id: 'formality-01',
      dimension: 'formality',
      sourceText:
        'The meeting has moved to Tuesday because two reviewers are unavailable on Monday.',
      candidateA: {
        text: 'The meeting has been rescheduled for Tuesday because two reviewers are unavailable on Monday.',
        instruction: 'Use polished, moderately formal phrasing.',
        avoidInstruction: 'Avoid casual shorthand in professional updates.',
      },
      candidateB: {
        text: "We've moved the meeting to Tuesday because two reviewers can't make Monday.",
        instruction: 'Use natural, conversational phrasing.',
        avoidInstruction: 'Avoid unnecessary formality in routine updates.',
      },
      preservedDetails: ['meeting', 'Tuesday', 'two reviewers', 'Monday'],
    },
    {
      id: 'concision-01',
      dimension: 'concision',
      sourceText:
        'The migration finished successfully. The team checked all 18 records and found no missing data.',
      candidateA: {
        text: 'The migration succeeded: all 18 records were checked, with no missing data.',
        instruction: 'Compress related details into concise sentences.',
        avoidInstruction:
          'Avoid repeating context that can be combined safely.',
      },
      candidateB: {
        text: 'The migration finished successfully. The team checked all 18 records. The check found no missing data.',
        instruction: 'Give important details their own explicit sentences.',
        avoidInstruction:
          'Do not compress distinct checks into dense phrasing.',
      },
      preservedDetails: [
        'migration succeeded',
        '18 records',
        'no missing data',
      ],
    },
    {
      id: 'rhythm-01',
      dimension: 'rhythm',
      sourceText:
        'The prototype is small. It is reliable. It is ready for a limited pilot.',
      candidateA: {
        text: 'The prototype is small and reliable. It is ready for a limited pilot.',
        instruction: 'Vary sentence length and combine closely related ideas.',
        avoidInstruction:
          'Avoid a repetitive sequence of similarly shaped sentences.',
      },
      candidateB: {
        text: 'The prototype is small. It is reliable. It is ready for a limited pilot.',
        instruction: 'Use short, consistently shaped sentences for emphasis.',
        avoidInstruction:
          'Avoid combining points when separation makes them easier to scan.',
      },
      preservedDetails: ['small', 'reliable', 'limited pilot'],
    },
    {
      id: 'vocabulary-01',
      dimension: 'vocabulary',
      sourceText:
        'The service waits before retrying a failed request so it does not overwhelm the provider.',
      candidateA: {
        text: 'The service backs off before retrying a failed request to avoid overwhelming the provider.',
        instruction:
          'Use precise domain terms when they make the explanation shorter.',
        avoidInstruction:
          'Avoid replacing useful technical terms with longer explanations.',
      },
      candidateB: {
        text: 'The service waits longer before trying a failed request again, so it does not overwhelm the provider.',
        instruction: 'Prefer plain language over specialist terminology.',
        avoidInstruction: 'Avoid jargon when an everyday explanation is clear.',
      },
      preservedDetails: ['waits before retrying', 'failed request', 'provider'],
    },
    {
      id: 'explanation-shape-01',
      dimension: 'explanation-shape',
      sourceText:
        'The cache should remain disabled because stale results would be more harmful than the extra latency.',
      candidateA: {
        text: 'Keep the cache disabled. Stale results would be more harmful than the extra latency.',
        instruction: 'State the conclusion first, then explain why.',
        avoidInstruction: 'Avoid making readers wait for the recommendation.',
      },
      candidateB: {
        text: 'Stale results would be more harmful than the extra latency, so keep the cache disabled.',
        instruction: 'Explain the reasoning before presenting the conclusion.',
        avoidInstruction:
          'Avoid leading with a recommendation before its rationale.',
      },
      preservedDetails: ['cache disabled', 'stale results', 'extra latency'],
    },
  ];

export const VOICE_DIMENSION_LABELS: Record<VoicePreferenceDimension, string> =
  {
    directness: 'Directness',
    warmth: 'Warmth',
    formality: 'Formality',
    concision: 'Concision',
    rhythm: 'Sentence rhythm',
    vocabulary: 'Vocabulary',
    'explanation-shape': 'Explanation shape',
    custom: 'Custom preference',
  };

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function createId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function styleSnapshot(voice: VoiceProfileRecord): StyleProfile {
  return {
    antiRules: [...voice.antiRules],
    description: voice.description,
    id: voice.id,
    name: voice.name,
    rules: [...voice.rules],
  };
}

export function compileVoicePreferences(
  voice: VoiceProfileRecord,
): VoiceProfileRecord {
  const active = voice.preferences.filter(
    (preference) =>
      preference.status === 'confirmed' || preference.status === 'user-set',
  );

  return {
    ...voice,
    antiRules: unique([
      ...voice.manualAntiRules,
      ...active.flatMap((preference) =>
        preference.avoidInstruction ? [preference.avoidInstruction] : [],
      ),
    ]),
    rules: unique([
      ...voice.manualRules,
      ...active.map((preference) => preference.instruction),
    ]),
  };
}

export function styleProfileWithTentativePreferences(
  voice: VoiceProfileRecord,
): StyleProfile {
  const tentativeDimensions = new Set(
    voice.preferences
      .filter((preference) => preference.status === 'tentative')
      .map((preference) => preference.dimension),
  );
  const active = voice.preferences.filter(
    (preference) =>
      preference.status === 'tentative' ||
      preference.status === 'user-set' ||
      !tentativeDimensions.has(preference.dimension),
  );

  return {
    antiRules: unique([
      ...voice.manualAntiRules,
      ...active.flatMap((preference) =>
        preference.avoidInstruction ? [preference.avoidInstruction] : [],
      ),
    ]),
    description: voice.description,
    id: voice.id,
    name: voice.name,
    rules: unique([
      ...voice.manualRules,
      ...active.map((preference) => preference.instruction),
    ]),
  };
}

export function startCalibrationSession(
  voice: VoiceProfileRecord,
  options: {
    focus?: VoicePreferenceDimension;
    mode: 'coach' | 'fine-tune';
    now?: string;
  },
): VoiceProfileRecord {
  const now = options.now ?? new Date().toISOString();
  const questions = options.focus
    ? CURATED_VOICE_COMPARISONS.filter(
        (comparison) => comparison.dimension === options.focus,
      )
    : options.mode === 'coach'
      ? CURATED_VOICE_COMPARISONS.slice(0, 7)
      : CURATED_VOICE_COMPARISONS.filter((comparison) => {
          const existing = voice.preferences.find(
            (preference) => preference.dimension === comparison.dimension,
          );
          return !existing || existing.confidence !== 'high';
        }).slice(0, 3);
  const session: VoiceCalibrationSession = {
    baseline: styleSnapshot(voice),
    currentIndex: 0,
    evidenceIds: [],
    focus: options.focus,
    id: createId('calibration'),
    mode: options.mode,
    questionIds: (questions.length > 0
      ? questions
      : CURATED_VOICE_COMPARISONS.slice(0, 3)
    ).map((question) => question.id),
    startedAt: now,
    status: 'active',
    voiceProfileId: voice.id,
  };

  return {
    ...voice,
    calibrationSessions: [...voice.calibrationSessions, session],
    updatedAt: now,
  };
}

function confidenceForEvidenceCount(
  evidenceCount: number,
): VoicePreference['confidence'] {
  if (evidenceCount >= 3) return 'high';
  if (evidenceCount >= 2) return 'medium';
  return 'low';
}

export function recordCalibrationChoice(
  voice: VoiceProfileRecord,
  sessionId: string,
  comparison: VoiceComparison,
  choice: CalibrationChoice,
  now = new Date().toISOString(),
): VoiceProfileRecord {
  const session = voice.calibrationSessions.find(
    (candidate) => candidate.id === sessionId,
  );

  if (!session || session.status !== 'active') {
    throw new Error('The calibration session is not active.');
  }

  if (session.questionIds[session.currentIndex] !== comparison.id) {
    throw new Error(
      'The calibration answer does not match the current question.',
    );
  }

  const evidence: VoicePreferenceEvidence = {
    candidateA: comparison.candidateA.text,
    candidateB: comparison.candidateB.text,
    createdAt: now,
    customText:
      choice.selected === 'custom' ? choice.customText.trim() : undefined,
    dimension: comparison.dimension,
    id: createId('evidence'),
    questionId: comparison.id,
    selected: choice.selected,
    sourceText: comparison.sourceText,
  };
  let preferences = voice.preferences;

  if (choice.selected === 'a' || choice.selected === 'b') {
    const selectedCandidate =
      choice.selected === 'a' ? comparison.candidateA : comparison.candidateB;
    const existingIndex = preferences.findIndex(
      (preference) =>
        preference.dimension === comparison.dimension &&
        preference.status === 'tentative' &&
        preference.source === session.mode,
    );
    const existing = preferences[existingIndex];
    const confirmingPreference = preferences.find(
      (preference) =>
        preference.dimension === comparison.dimension &&
        preference.status === 'confirmed' &&
        preference.instruction === selectedCandidate.instruction,
    );
    const evidenceIds = existing
      ? [...existing.evidenceIds, evidence.id]
      : confirmingPreference
        ? [...confirmingPreference.evidenceIds, evidence.id]
        : [evidence.id];
    const preference: VoicePreference = {
      avoidInstruction: selectedCandidate.avoidInstruction,
      confidence: confidenceForEvidenceCount(evidenceIds.length),
      createdAt: existing?.createdAt ?? now,
      dimension: comparison.dimension,
      evidenceIds,
      id: existing?.id ?? createId('preference'),
      instruction: selectedCandidate.instruction,
      source: session.mode,
      status: 'tentative',
      updatedAt: now,
    };
    preferences = existing
      ? preferences.map((candidate, index) =>
          index === existingIndex ? preference : candidate,
        )
      : [...preferences, preference];
  }

  const nextIndex = session.currentIndex + 1;
  const updatedSession: VoiceCalibrationSession = {
    ...session,
    currentIndex: nextIndex,
    evidenceIds: [...session.evidenceIds, evidence.id],
    status: nextIndex >= session.questionIds.length ? 'review' : 'active',
  };

  return {
    ...voice,
    calibrationSessions: voice.calibrationSessions.map((candidate) =>
      candidate.id === session.id ? updatedSession : candidate,
    ),
    preferenceEvidence: [...voice.preferenceEvidence, evidence],
    preferences,
    updatedAt: now,
  };
}

export function replaceCurrentWithAdaptiveComparison(
  voice: VoiceProfileRecord,
  sessionId: string,
  comparison: AdaptiveVoiceComparisonResponse,
  now = new Date().toISOString(),
): VoiceProfileRecord {
  return {
    ...voice,
    calibrationSessions: voice.calibrationSessions.map((session) => {
      if (session.id !== sessionId || session.status !== 'active') {
        return session;
      }

      return {
        ...session,
        generatedComparisons: [
          ...(session.generatedComparisons ?? []).slice(-4),
          comparison,
        ],
        questionIds: session.questionIds.map((questionId, index) =>
          index === session.currentIndex ? comparison.id : questionId,
        ),
      };
    }),
    updatedAt: now,
  };
}

export function updateVoicePreference(
  voice: VoiceProfileRecord,
  preferenceId: string,
  patch: Pick<VoicePreference, 'instruction' | 'avoidInstruction'>,
  now = new Date().toISOString(),
  markUserSet = false,
): VoiceProfileRecord {
  return {
    ...voice,
    preferences: voice.preferences.map((preference) =>
      preference.id === preferenceId
        ? {
            ...preference,
            ...patch,
            source: markUserSet ? ('manual' as const) : preference.source,
            status: markUserSet ? ('user-set' as const) : preference.status,
            updatedAt: now,
          }
        : preference,
    ),
    updatedAt: now,
  };
}

export function removeVoicePreference(
  voice: VoiceProfileRecord,
  preferenceId: string,
  now = new Date().toISOString(),
): VoiceProfileRecord {
  return compileVoicePreferences({
    ...voice,
    preferences: voice.preferences.filter(
      (preference) => preference.id !== preferenceId,
    ),
    updatedAt: now,
  });
}

export function confirmCalibrationSession(
  voice: VoiceProfileRecord,
  sessionId: string,
  now = new Date().toISOString(),
): VoiceProfileRecord {
  const session = voice.calibrationSessions.find(
    (candidate) => candidate.id === sessionId,
  );

  if (
    !session ||
    (session.status !== 'review' && session.status !== 'completed')
  ) {
    throw new Error('The calibration session is not ready to save.');
  }

  const sessionEvidenceIds = new Set(session.evidenceIds);
  const sessionPreferences = voice.preferences.filter(
    (preference) =>
      preference.status === 'tentative' &&
      preference.evidenceIds.some((id) => sessionEvidenceIds.has(id)),
  );
  const affectedDimensions = new Set(
    sessionPreferences.map((preference) => preference.dimension),
  );
  const retainedPreferences = voice.preferences.filter(
    (preference) =>
      !affectedDimensions.has(preference.dimension) ||
      sessionPreferences.some((candidate) => candidate.id === preference.id) ||
      preference.status === 'user-set',
  );
  const preferences = retainedPreferences.map((preference) =>
    sessionPreferences.some((candidate) => candidate.id === preference.id)
      ? { ...preference, status: 'confirmed' as const, updatedAt: now }
      : preference,
  );
  const customEvidence = voice.preferenceEvidence.filter(
    (evidence) =>
      sessionEvidenceIds.has(evidence.id) &&
      evidence.selected === 'custom' &&
      evidence.customText,
  );
  const next = compileVoicePreferences({
    ...voice,
    calibrationSessions: voice.calibrationSessions.map((candidate) =>
      candidate.id === session.id
        ? { ...candidate, completedAt: now, status: 'completed' as const }
        : candidate,
    ),
    examples: [
      ...voice.examples,
      ...customEvidence.map((evidence, index) => ({
        createdAt: now,
        id: createId('calibration-example'),
        label: `Calibration example ${voice.examples.length + index + 1}`,
        text: evidence.customText!,
      })),
    ],
    preferences,
    updatedAt: now,
  });

  return next;
}

export function setCalibrationProof(
  voice: VoiceProfileRecord,
  sessionId: string,
  proof: VoiceCalibrationProof,
  now = new Date().toISOString(),
): VoiceProfileRecord {
  return {
    ...voice,
    calibrationSessions: voice.calibrationSessions.map((session) =>
      session.id === sessionId ? { ...session, proof } : session,
    ),
    updatedAt: now,
  };
}

export function clearCalibrationProof(
  voice: VoiceProfileRecord,
  sessionId: string,
  now = new Date().toISOString(),
): VoiceProfileRecord {
  return {
    ...voice,
    calibrationSessions: voice.calibrationSessions.map((session) =>
      session.id === sessionId ? { ...session, proof: undefined } : session,
    ),
    updatedAt: now,
  };
}

export function recordCalibrationProofChoice(
  voice: VoiceProfileRecord,
  sessionId: string,
  selected: 'a' | 'b' | 'tie' | 'neither',
  meaningChanged = false,
  now = new Date().toISOString(),
): VoiceProfileRecord {
  return {
    ...voice,
    calibrationSessions: voice.calibrationSessions.map((session) =>
      session.id === sessionId && session.proof
        ? {
            ...session,
            proof: { ...session.proof, meaningChanged, selected },
          }
        : session,
    ),
    updatedAt: now,
  };
}

export function abandonCalibrationSession(
  voice: VoiceProfileRecord,
  sessionId: string,
  now = new Date().toISOString(),
): VoiceProfileRecord {
  const session = voice.calibrationSessions.find(
    (candidate) => candidate.id === sessionId,
  );

  if (!session) return voice;
  const evidenceIds = new Set(session.evidenceIds);

  return {
    ...voice,
    calibrationSessions: voice.calibrationSessions.map((candidate) =>
      candidate.id === sessionId
        ? { ...candidate, completedAt: now, status: 'abandoned' as const }
        : candidate,
    ),
    preferences: voice.preferences.filter(
      (preference) =>
        preference.status !== 'tentative' ||
        !preference.evidenceIds.some((id) => evidenceIds.has(id)),
    ),
    updatedAt: now,
  };
}

export function resetLearnedVoice(
  voice: VoiceProfileRecord,
  now = new Date().toISOString(),
): VoiceProfileRecord {
  return compileVoicePreferences({
    ...voice,
    calibrationSessions: [],
    preferenceEvidence: [],
    preferences: voice.preferences.filter(
      (preference) => preference.source === 'manual',
    ),
    updatedAt: now,
  });
}

function firstSentence(text: string): string {
  return text.trim().split(/(?<=[.!?])\s+/u)[0] ?? text.trim();
}

function countMatches(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

export function suggestPreferencesFromEdit(
  generatedText: string,
  editedText: string,
): VoiceEditSuggestion[] {
  const generated = generatedText.trim();
  const edited = editedText.trim();

  if (!generated || !edited || generated === edited) return [];

  const suggestions: VoiceEditSuggestion[] = [];
  const generatedWords = generated.split(/\s+/u).length;
  const editedWords = edited.split(/\s+/u).length;
  const generatedOpening = firstSentence(generated);
  const editedOpening = firstSentence(edited);
  const hedgePattern =
    /\b(?:perhaps|possibly|might|may|could|it seems|generally)\b/giu;
  const corporatePattern =
    /\b(?:leverage|utilize|synergy|actionable insights|cutting-edge)\b/giu;

  if (
    editedOpening.split(/\s+/u).length + 3 <
    generatedOpening.split(/\s+/u).length
  ) {
    suggestions.push({
      after: editedOpening,
      before: generatedOpening,
      description: 'You made the opening shorter and more immediate.',
      dimension: 'directness',
      id: 'edit-direct-opening',
      instruction: 'Lead with the point in a short opening sentence.',
      title: 'Lead with the point',
    });
  }

  if (
    countMatches(generated, hedgePattern) > countMatches(edited, hedgePattern)
  ) {
    suggestions.push({
      after: editedOpening,
      avoidInstruction: 'Avoid unnecessary hedges and weak qualifiers.',
      before: generatedOpening,
      description: 'You removed hedging from the rewrite.',
      dimension: 'directness',
      id: 'edit-fewer-qualifiers',
      instruction: 'Use confident phrasing when the source supports it.',
      title: 'Use fewer qualifiers',
    });
  }

  if (
    countMatches(generated, corporatePattern) >
    countMatches(edited, corporatePattern)
  ) {
    suggestions.push({
      after: editedOpening,
      avoidInstruction: 'Avoid corporate filler and fashionable buzzwords.',
      before: generatedOpening,
      description: 'You replaced corporate phrasing with plainer language.',
      dimension: 'vocabulary',
      id: 'edit-plain-language',
      instruction: 'Prefer plain language and concrete verbs.',
      title: 'Prefer plain language',
    });
  }

  if (editedWords <= Math.floor(generatedWords * 0.82)) {
    suggestions.push({
      after: edited.slice(0, 180),
      avoidInstruction: 'Avoid repetition that does not add meaning.',
      before: generated.slice(0, 180),
      description:
        'You shortened the rewrite while retaining its main content.',
      dimension: 'concision',
      id: 'edit-concision',
      instruction:
        'Prefer concise phrasing when details can be combined safely.',
      title: 'Write more concisely',
    });
  }

  return suggestions.slice(0, 3);
}

export function saveEditSuggestion(
  voice: VoiceProfileRecord,
  suggestion: VoiceEditSuggestion,
  now = new Date().toISOString(),
): VoiceProfileRecord {
  const evidence: VoicePreferenceEvidence = {
    candidateA: suggestion.before,
    candidateB: suggestion.after,
    createdAt: now,
    dimension: suggestion.dimension,
    id: createId('edit-evidence'),
    questionId: suggestion.id,
    selected: 'b',
    sourceText: suggestion.before,
  };
  const preference: VoicePreference = {
    avoidInstruction: suggestion.avoidInstruction,
    confidence: 'low',
    createdAt: now,
    dimension: suggestion.dimension,
    evidenceIds: [evidence.id],
    id: createId('edit-preference'),
    instruction: suggestion.instruction,
    source: 'edit-suggestion',
    status: 'confirmed',
    updatedAt: now,
  };
  const retained = voice.preferences.filter(
    (candidate) =>
      candidate.dimension !== suggestion.dimension ||
      candidate.status === 'user-set',
  );

  return compileVoicePreferences({
    ...voice,
    preferenceEvidence: [...voice.preferenceEvidence, evidence],
    preferences: [...retained, preference],
    updatedAt: now,
  });
}

export function getComparisonById(
  id: string,
): CuratedVoiceComparison | undefined {
  return CURATED_VOICE_COMPARISONS.find((comparison) => comparison.id === id);
}
