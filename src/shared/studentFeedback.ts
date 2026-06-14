import type { StyleProfile } from './types';

export type StudentFeedbackMatch = {
  phrase: string;
  reason: 'unsupported-detail' | 'vague-praise';
};

export type StudentFeedbackCheck = {
  active: boolean;
  matches: StudentFeedbackMatch[];
  pass: boolean;
};

export type StudentFeedbackPolicy = {
  active: boolean;
  instruction: string;
  unsupportedDetailPhrases: string[];
  vaguePraisePhrases: string[];
};

export const DEFAULT_UNSUPPORTED_FEEDBACK_DETAILS = [
  'subsection',
  'subsections',
  'upcoming project',
  'upcoming projects',
  'upcoming task',
  'upcoming tasks',
  'data visualization',
  'formula',
  'calculation',
  'technical success',
  'structural success',
  'technical detail',
  'data point',
  'main argument',
  'technical or structural',
  'technical element',
  'structural element',
  'level of detail',
  'this level of detail',
  'uniform flow',
  'strong grasp',
  'the material',
  'core message',
  'next submission',
  'project',
];

export const DEFAULT_VAGUE_FEEDBACK_PRAISE = [
  'great job',
  'amazing',
  'amazing work',
  'fantastic',
  'incredible',
  'wonderful',
  'excellent',
  'high quality',
  'high-quality',
  'high standard',
  'high level of effort',
  'strong effort',
  'well-executed',
  'well-constructed',
  'proud of this work',
  'so proud',
  'feel proud',
  'feel amazing',
  'feel confident',
];

function profileText(profile: StyleProfile): string {
  return [
    profile.id,
    profile.name,
    profile.description,
    ...profile.rules,
    ...profile.antiRules,
  ]
    .join(' ')
    .toLowerCase();
}

export function shouldApplyStudentFeedbackGate(profile: StyleProfile): boolean {
  const lower = profileText(profile);
  return lower.includes('student') || lower.includes('feedback');
}

export function buildStudentFeedbackPolicy(
  profile: StyleProfile,
): StudentFeedbackPolicy {
  if (!shouldApplyStudentFeedbackGate(profile)) {
    return {
      active: false,
      instruction: '',
      unsupportedDetailPhrases: [],
      vaguePraisePhrases: [],
    };
  }

  return {
    active: true,
    instruction:
      'Student feedback constraint: do not invent concrete artifacts, sections, formulas, projects, technical details, structural elements, or student-work details that are not present in the source. If the source is vague, make the next step about replacing general praise with one specific part of the answer, not about imagined technical or structural content. Avoid vague praise and over-warm encouragement.',
    unsupportedDetailPhrases: DEFAULT_UNSUPPORTED_FEEDBACK_DETAILS,
    vaguePraisePhrases: DEFAULT_VAGUE_FEEDBACK_PRAISE,
  };
}

export function checkStudentFeedback(
  output: string,
  sourceText: string,
  policy: StudentFeedbackPolicy,
): StudentFeedbackCheck {
  if (!policy.active) {
    return {
      active: false,
      matches: [],
      pass: true,
    };
  }

  const lowerOutput = output.toLowerCase();
  const lowerSource = sourceText.toLowerCase();
  const unsupportedMatches = policy.unsupportedDetailPhrases
    .filter(
      (phrase) => lowerOutput.includes(phrase) && !lowerSource.includes(phrase),
    )
    .map((phrase) => ({
      phrase,
      reason: 'unsupported-detail' as const,
    }));
  const vaguePraiseMatches = policy.vaguePraisePhrases
    .filter((phrase) => lowerOutput.includes(phrase))
    .map((phrase) => ({
      phrase,
      reason: 'vague-praise' as const,
    }));
  const matches = [...unsupportedMatches, ...vaguePraiseMatches];

  return {
    active: true,
    matches,
    pass: matches.length === 0,
  };
}

export function buildStudentFeedbackFeedback(
  check: StudentFeedbackCheck,
): string {
  if (check.pass || check.matches.length === 0) {
    return '';
  }

  const unsupported = check.matches
    .filter((match) => match.reason === 'unsupported-detail')
    .map((match) => match.phrase);
  const vaguePraise = check.matches
    .filter((match) => match.reason === 'vague-praise')
    .map((match) => match.phrase);
  const messages = [];

  if (unsupported.length > 0) {
    messages.push(
      `Remove unsupported feedback details: ${unsupported.join(', ')}.`,
    );
  }

  if (vaguePraise.length > 0) {
    messages.push(`Replace vague praise: ${vaguePraise.join(', ')}.`);
  }

  messages.push(
    'Use only details present in the source. If the source is vague, say what to inspect, explain, add, or revise without inventing the content.',
  );

  return messages.join(' ');
}
