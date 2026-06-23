import { DEFAULT_PROVIDER, DEFAULT_STYLE_PROFILE } from '../shared/defaults';
import type { DocumentRecord, ModelProviderSettings } from '../shared/types';

const DOCUMENTS_KEY = 'stylemakar.documents';
const PROVIDER_KEY = 'stylemakar.provider';

export function loadDocuments(seed: DocumentRecord[]): DocumentRecord[] {
  const stored = localStorage.getItem(DOCUMENTS_KEY);

  if (!stored) {
    return seed;
  }

  try {
    const parsed = JSON.parse(stored) as DocumentRecord[];
    return parsed.length > 0 ? parsed : seed;
  } catch {
    return seed;
  }
}

export function saveDocuments(documents: DocumentRecord[]): void {
  localStorage.setItem(DOCUMENTS_KEY, JSON.stringify(documents));
}

export function loadProvider(): ModelProviderSettings {
  const stored = localStorage.getItem(PROVIDER_KEY);

  if (!stored) {
    return DEFAULT_PROVIDER;
  }

  try {
    const provider = {
      ...DEFAULT_PROVIDER,
      ...(JSON.parse(stored) as ModelProviderSettings),
    };

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

export function saveProvider(provider: ModelProviderSettings): void {
  localStorage.setItem(PROVIDER_KEY, JSON.stringify(provider));
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
    warnings: [],
  };
}
