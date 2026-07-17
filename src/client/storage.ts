import {
  DEFAULT_PROVIDER,
  DEFAULT_STYLE_PROFILE,
  DEFAULT_VOICE_PROFILE,
  DEFAULT_VOICE_PROFILES,
} from '../shared/defaults';
import {
  capabilityMatchesProvider,
  normalizeProviderProfile,
} from '../shared/provider';
import type {
  AppBackup,
  DocumentRecord,
  ProviderCapabilityStatus,
  ProviderProfile,
  VoiceProfileRecord,
} from '../shared/types';

const DOCUMENTS_KEY = 'stylemakar.documents';
const PROVIDER_KEY = 'stylemakar.provider';
const PROVIDER_CAPABILITY_KEY = 'stylemakar.provider-capability';
const VOICES_KEY = 'stylemakar.voices';
const DOCUMENT_RECOVERY_KEY = 'stylemakar.documents-recovery';

const MAX_EXAMPLE_LENGTH = 50_000;

function normalizeDocument(document: DocumentRecord): DocumentRecord {
  const voiceProfileId = document.voiceProfileId ?? DEFAULT_VOICE_PROFILE.id;
  const versions = document.versions ?? [];

  if (versions.length > 0 || !document.rewrittenText) {
    return { ...document, schemaVersion: 2, versions, voiceProfileId };
  }

  const legacyVersion = {
    createdAt: document.updatedAt,
    editedText: document.rewrittenText,
    generatedText: document.rewrittenText,
    id: `legacy-${document.id}`,
    model: document.provider.model ?? 'unknown',
    providerId: document.provider.baseUrl,
    quality: {
      meaning: 'not-checked' as const,
      preservedDetails: [],
      risks: [],
      warnings: document.warnings,
    },
    runId: `legacy-${document.id}`,
    voiceProfileId,
  };

  return {
    ...document,
    selectedVersionId: legacyVersion.id,
    schemaVersion: 2,
    versions: [legacyVersion],
    voiceProfileId,
  };
}

export function loadDocuments(seed: DocumentRecord[]): DocumentRecord[] {
  const stored = localStorage.getItem(DOCUMENTS_KEY);

  if (!stored) {
    return seed.map(normalizeDocument);
  }

  try {
    const parsed = JSON.parse(stored) as
      | DocumentRecord[]
      | { documents?: DocumentRecord[]; schemaVersion?: number };
    const documents = Array.isArray(parsed) ? parsed : parsed.documents;

    if (!Array.isArray(documents)) {
      throw new Error('Document store does not contain a documents array.');
    }

    return documents.length > 0
      ? documents.map(normalizeDocument)
      : seed.map(normalizeDocument);
  } catch {
    localStorage.setItem(
      DOCUMENT_RECOVERY_KEY,
      JSON.stringify({ capturedAt: new Date().toISOString(), raw: stored }),
    );
    return seed.map(normalizeDocument);
  }
}

export function validateVoiceProfile(
  candidate: VoiceProfileRecord,
): VoiceProfileRecord {
  if (!candidate.id?.trim() || !candidate.name?.trim()) {
    throw new Error('Voice profiles require a name and ID.');
  }

  if (!Array.isArray(candidate.examples)) {
    throw new Error('Voice profile examples must be an array.');
  }

  const exampleIds = new Set<string>();

  for (const example of candidate.examples) {
    if (!example.id?.trim() || exampleIds.has(example.id)) {
      throw new Error('Voice example IDs must be present and unique.');
    }

    if (typeof example.text !== 'string' || example.text.trim() === '') {
      throw new Error('Voice examples cannot be empty.');
    }

    if (example.text.length > MAX_EXAMPLE_LENGTH) {
      throw new Error('A voice example cannot exceed 50,000 characters.');
    }

    exampleIds.add(example.id);
  }

  return {
    ...candidate,
    antiRules: Array.isArray(candidate.antiRules) ? candidate.antiRules : [],
    description: candidate.description ?? '',
    name: candidate.name.trim(),
    rules: Array.isArray(candidate.rules) ? candidate.rules : [],
    schemaVersion: 1,
  };
}

export function loadVoiceProfiles(): VoiceProfileRecord[] {
  const stored = localStorage.getItem(VOICES_KEY);

  if (!stored) {
    return DEFAULT_VOICE_PROFILES;
  }

  try {
    const parsed = JSON.parse(stored) as VoiceProfileRecord[];
    const voices = parsed.map(validateVoiceProfile);
    const ids = new Set(voices.map((voice) => voice.id));

    if (ids.size !== voices.length) {
      throw new Error('Voice profile IDs must be unique.');
    }

    return voices.length > 0 ? voices : DEFAULT_VOICE_PROFILES;
  } catch {
    return DEFAULT_VOICE_PROFILES;
  }
}

export function saveVoiceProfiles(voices: VoiceProfileRecord[]): void {
  const ids = new Set<string>();
  const validated = voices.map((voice) => {
    const result = validateVoiceProfile(voice);

    if (ids.has(result.id)) {
      throw new Error('Voice profile IDs must be unique.');
    }

    ids.add(result.id);
    return result;
  });
  localStorage.setItem(VOICES_KEY, JSON.stringify(validated));
}

export function parseVoiceProfileImport(text: string): VoiceProfileRecord {
  let candidate: unknown;

  try {
    candidate = JSON.parse(text);
  } catch {
    throw new Error('Voice profile imports must be valid JSON.');
  }

  if (!candidate || typeof candidate !== 'object') {
    throw new Error('Voice profile import must contain an object.');
  }

  return validateVoiceProfile(candidate as VoiceProfileRecord);
}

export function saveDocuments(documents: DocumentRecord[]): void {
  localStorage.setItem(
    DOCUMENTS_KEY,
    JSON.stringify({
      documents: documents.map(normalizeDocument),
      schemaVersion: 2,
      updatedAt: new Date().toISOString(),
    }),
  );
}

export function hasDocumentRecovery(): boolean {
  return Boolean(localStorage.getItem(DOCUMENT_RECOVERY_KEY));
}

export function createAppBackup(
  documents: DocumentRecord[],
  voices: VoiceProfileRecord[],
): AppBackup {
  return {
    documents: documents.map(normalizeDocument),
    exportedAt: new Date().toISOString(),
    schemaVersion: 1,
    voices: voices.map(validateVoiceProfile),
  };
}

export function parseAppBackup(text: string): AppBackup {
  let candidate: unknown;

  try {
    candidate = JSON.parse(text);
  } catch {
    throw new Error('Backup must be valid JSON.');
  }

  if (!candidate || typeof candidate !== 'object') {
    throw new Error('Backup must contain an object.');
  }

  const backup = candidate as Partial<AppBackup>;

  if (!Array.isArray(backup.documents) || !Array.isArray(backup.voices)) {
    throw new Error('Backup must contain documents and voices.');
  }

  return {
    documents: backup.documents.map(normalizeDocument),
    exportedAt:
      typeof backup.exportedAt === 'string'
        ? backup.exportedAt
        : new Date().toISOString(),
    schemaVersion: 1,
    voices: backup.voices.map(validateVoiceProfile),
  };
}

export function loadProvider(): ProviderProfile {
  const stored = localStorage.getItem(PROVIDER_KEY);

  if (!stored) {
    return DEFAULT_PROVIDER;
  }

  try {
    const provider = normalizeProviderProfile(
      JSON.parse(stored) as Partial<ProviderProfile>,
    );

    if (
      provider.reasoningEffort === 'minimal' &&
      provider.model?.toLowerCase().includes('gemma-4-12b-qat')
    ) {
      return { ...provider, reasoningEffort: 'none' };
    }

    return provider;
  } catch {
    return DEFAULT_PROVIDER;
  }
}

export function saveProvider(provider: ProviderProfile): void {
  localStorage.setItem(PROVIDER_KEY, JSON.stringify(provider));
}

export function loadProviderCapability(
  provider: ProviderProfile,
): ProviderCapabilityStatus | undefined {
  const stored = localStorage.getItem(PROVIDER_CAPABILITY_KEY);

  if (!stored) {
    return undefined;
  }

  try {
    const capability = JSON.parse(stored) as ProviderCapabilityStatus;
    return capabilityMatchesProvider(capability, provider)
      ? capability
      : undefined;
  } catch {
    return undefined;
  }
}

export function saveProviderCapability(
  capability: ProviderCapabilityStatus,
): void {
  localStorage.setItem(PROVIDER_CAPABILITY_KEY, JSON.stringify(capability));
}

export function createBlankDocument(): DocumentRecord {
  const now = new Date().toISOString();

  return {
    createdAt: now,
    id: crypto.randomUUID(),
    originalText: '',
    provider: DEFAULT_PROVIDER,
    rewrittenText: '',
    styleProfile: DEFAULT_STYLE_PROFILE,
    title: 'Untitled Document',
    updatedAt: now,
    voiceProfileId: DEFAULT_VOICE_PROFILE.id,
    warnings: [],
    versions: [],
    schemaVersion: 2,
  };
}
