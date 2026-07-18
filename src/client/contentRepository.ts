import type {
  ContentStoreSnapshot,
  DocumentRecord,
  VoiceProfileRecord,
} from '../shared/types';
import {
  loadDocuments,
  loadVoiceProfiles,
  saveDocuments,
  saveVoiceProfiles,
  validateVoiceProfile,
} from './storage';
import {
  isTauriRuntime,
  loadTauriContentStore,
  saveTauriContentStore,
} from './tauri';

let nativeSaveQueue: Promise<void> = Promise.resolve();

export function validateContentStoreSnapshot(
  candidate: unknown,
): ContentStoreSnapshot {
  if (!candidate || typeof candidate !== 'object') {
    throw new Error('Content store must contain an object.');
  }

  const snapshot = candidate as Partial<ContentStoreSnapshot>;
  const schemaVersion = (candidate as { schemaVersion?: number }).schemaVersion;

  if (
    (schemaVersion !== 1 && schemaVersion !== 2) ||
    !Array.isArray(snapshot.documents) ||
    !Array.isArray(snapshot.voices)
  ) {
    throw new Error('Content store schema is unsupported or incomplete.');
  }

  const documentIds = new Set<string>();
  const documents = snapshot.documents.map((document, index) => {
    if (
      !document ||
      typeof document.id !== 'string' ||
      !document.id ||
      documentIds.has(document.id) ||
      typeof document.title !== 'string' ||
      typeof document.originalText !== 'string' ||
      typeof document.rewrittenText !== 'string' ||
      !Array.isArray(document.warnings)
    ) {
      throw new Error(`Document ${index + 1} is malformed or duplicated.`);
    }

    documentIds.add(document.id);
    return document;
  });
  const voiceIds = new Set<string>();
  const voices = snapshot.voices.map((voice) => {
    const validated = validateVoiceProfile(voice);

    if (voiceIds.has(validated.id)) {
      throw new Error(`Voice profile ${validated.id} is duplicated.`);
    }

    voiceIds.add(validated.id);
    return validated;
  });

  return {
    documents,
    schemaVersion: 2,
    updatedAt:
      typeof snapshot.updatedAt === 'string'
        ? snapshot.updatedAt
        : new Date().toISOString(),
    voices,
  };
}

export async function loadContentStore(
  seedDocuments: DocumentRecord[],
): Promise<ContentStoreSnapshot | undefined> {
  if (isTauriRuntime()) {
    const snapshot = await loadTauriContentStore();
    return snapshot ? validateContentStoreSnapshot(snapshot) : undefined;
  }

  return {
    documents: loadDocuments(seedDocuments),
    schemaVersion: 2,
    updatedAt: new Date().toISOString(),
    voices: loadVoiceProfiles(),
  };
}

export async function saveContentStore(
  documents: DocumentRecord[],
  voices: VoiceProfileRecord[],
): Promise<void> {
  const snapshot = validateContentStoreSnapshot({
    documents,
    schemaVersion: 2,
    updatedAt: new Date().toISOString(),
    voices,
  });

  if (isTauriRuntime()) {
    nativeSaveQueue = nativeSaveQueue
      .catch(() => undefined)
      .then(() => saveTauriContentStore(snapshot));
    await nativeSaveQueue;
    return;
  }

  saveDocuments(snapshot.documents);
  saveVoiceProfiles(snapshot.voices);
}
