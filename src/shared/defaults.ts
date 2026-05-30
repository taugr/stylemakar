import type { ModelProviderSettings, StyleProfile } from './types';

export const DEFAULT_PROVIDER: ModelProviderSettings = {
  baseUrl: 'http://localhost:1234/v1',
  model: 'gemma-4',
  reasoningEffort: 'minimal',
};

export const DEFAULT_STYLE_PROFILE: StyleProfile = {
  id: 'technical',
  name: 'My Technical Style',
  description:
    'Direct, specific, plain-spoken technical prose with minimal marketing language.',
  rules: [
    'Use direct verbs and concrete nouns.',
    'Keep claims specific and grounded.',
    'Prefer short paragraphs with clear transitions.',
    'Preserve constraints, caveats, names, and numbers exactly.',
  ],
  antiRules: [
    'Do not add hype, exaggeration, or new claims.',
    'Do not imitate typos.',
    'Do not remove details to sound smoother.',
  ],
};

export const DEFAULT_REFERENCE_EXAMPLES = [
  'We should keep the implementation small, because the hard part is verifying that the behavior survives real input.',
  'The goal is not to sound polished. The goal is to make the point clearly without losing the constraints.',
];

export const MAX_REWRITE_ITERATIONS = 2;
export const DEFAULT_STYLE_THRESHOLD = 85;
