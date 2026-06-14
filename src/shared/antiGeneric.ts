import type { StyleProfile } from './types';

export type AntiGenericMatch = {
  phrase: string;
};

export type AntiGenericCheck = {
  active: boolean;
  matches: AntiGenericMatch[];
  pass: boolean;
  phrases: string[];
};

export type AntiGenericPolicy = {
  active: boolean;
  instruction: string;
  phrases: string[];
};

export const DEFAULT_GENERIC_PHRASES = [
  'it is important to note',
  'robust and comprehensive',
  'robust, comprehensive',
  'delve into',
  'leverage',
  'seamless user experience',
  'in conclusion',
  "in today's fast-paced world",
  'unlock the power of',
  'a testament to',
  'cutting-edge',
  'actionable insights',
  'empower organizations',
  'accelerate growth',
];

const ACTIVATION_TERMS = [
  'direct',
  'technical',
  'generic',
  'hype',
  'corporate',
  'marketing',
  'polish',
];

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

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

export function shouldApplyAntiGenericGate(profile: StyleProfile): boolean {
  const lower = profileText(profile);
  return ACTIVATION_TERMS.some((term) => lower.includes(term));
}

export function buildAntiGenericPolicy(
  profile: StyleProfile,
  sourceText: string,
): AntiGenericPolicy {
  if (!shouldApplyAntiGenericGate(profile)) {
    return {
      active: false,
      instruction: '',
      phrases: [],
    };
  }

  const lowerSource = sourceText.toLowerCase();
  const sourcePhrases = DEFAULT_GENERIC_PHRASES.filter((phrase) =>
    lowerSource.includes(phrase),
  );
  const phrases = unique([...DEFAULT_GENERIC_PHRASES, ...sourcePhrases]);
  const instruction = [
    `Anti-generic constraint: remove or replace these phrases when they appear: ${phrases.join(', ')}.`,
    'Do not preserve marketing filler as mandatory meaning. Preserve concrete facts, caveats, names, dates, numbers, and technical claims instead.',
  ].join(' ');

  return {
    active: true,
    instruction,
    phrases,
  };
}

export function checkAntiGeneric(
  output: string,
  policy: AntiGenericPolicy,
): AntiGenericCheck {
  if (!policy.active) {
    return {
      active: false,
      matches: [],
      pass: true,
      phrases: [],
    };
  }

  const lower = output.toLowerCase();
  const matches = policy.phrases
    .filter((phrase) => lower.includes(phrase.toLowerCase()))
    .map((phrase) => ({ phrase }));

  return {
    active: true,
    matches,
    pass: matches.length === 0,
    phrases: policy.phrases,
  };
}

export function buildAntiGenericFeedback(check: AntiGenericCheck): string {
  if (check.pass || check.matches.length === 0) {
    return '';
  }

  const phrases = check.matches.map((match) => match.phrase).join(', ');

  return [
    `Remove these generic phrases: ${phrases}.`,
    'Replace marketing claims with concrete mechanism, constraint, or plain wording. If the source only contains filler, omit the filler rather than preserving it.',
  ].join(' ');
}
