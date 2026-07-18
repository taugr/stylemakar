import type {
  ProviderKind,
  ProviderProfile,
  StyleProfile,
  VoiceProfileRecord,
} from './types';

export const PROVIDER_PRESETS: ReadonlyArray<ProviderProfile> = [
  {
    baseUrl: 'http://localhost:1234/v1',
    id: 'lmstudio',
    kind: 'lmstudio',
    name: 'LM Studio',
    reasoningEffort: 'none',
  },
  {
    baseUrl: 'http://localhost:11434/v1',
    id: 'ollama',
    kind: 'ollama',
    name: 'Ollama',
    reasoningEffort: 'none',
  },
  {
    baseUrl: 'http://localhost:8000/v1',
    id: 'custom',
    kind: 'custom',
    name: 'Custom provider',
    reasoningEffort: 'none',
  },
];

export const DEFAULT_PROVIDER: ProviderProfile = {
  baseUrl: 'http://localhost:1234/v1',
  id: 'lmstudio',
  kind: 'lmstudio',
  name: 'LM Studio',
  reasoningEffort: 'none',
};

export function getProviderPreset(kind: ProviderKind): ProviderProfile {
  return (
    PROVIDER_PRESETS.find((preset) => preset.kind === kind) ?? DEFAULT_PROVIDER
  );
}

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

export const DEFAULT_VOICE_PROFILE: VoiceProfileRecord = {
  ...DEFAULT_STYLE_PROFILE,
  calibrationSessions: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  examples: DEFAULT_REFERENCE_EXAMPLES.map((text, index) => ({
    createdAt: '2026-01-01T00:00:00.000Z',
    id: `technical-example-${index + 1}`,
    label: `Product note ${index + 1}`,
    text,
  })),
  isStarter: true,
  manualAntiRules: [...DEFAULT_STYLE_PROFILE.antiRules],
  manualRules: [...DEFAULT_STYLE_PROFILE.rules],
  name: 'Product notes',
  preferenceEvidence: [],
  preferences: [],
  schemaVersion: 2,
  updatedAt: '2026-01-01T00:00:00.000Z',
};

export const DEFAULT_VOICE_PROFILES: VoiceProfileRecord[] = [
  DEFAULT_VOICE_PROFILE,
];

export const MAX_REWRITE_ITERATIONS = 2;
export const DEFAULT_STYLE_THRESHOLD = 85;
