import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_VOICE_PROFILE } from '../shared/defaults';
import type { ContentStoreSnapshot, DocumentRecord } from '../shared/types';

const tauri = vi.hoisted(() => ({
  runtime: false,
  load: vi.fn<() => Promise<ContentStoreSnapshot | undefined>>(),
  save: vi.fn<(snapshot: ContentStoreSnapshot) => Promise<void>>(),
}));

vi.mock('./tauri', () => ({
  isTauriRuntime: () => tauri.runtime,
  loadTauriContentStore: tauri.load,
  saveTauriContentStore: tauri.save,
}));

import {
  loadContentStore,
  saveContentStore,
  validateContentStoreSnapshot,
} from './contentRepository';

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const document: DocumentRecord = {
  createdAt: '2026-07-18T00:00:00.000Z',
  id: 'document-one',
  originalText: 'Source',
  provider: { baseUrl: 'http://localhost:1234/v1', model: 'model' },
  rewrittenText: 'Rewrite',
  styleProfile: DEFAULT_VOICE_PROFILE,
  title: 'Document',
  updatedAt: '2026-07-18T00:00:00.000Z',
  versions: [],
  voiceProfileId: DEFAULT_VOICE_PROFILE.id,
  warnings: [],
};

beforeEach(() => {
  tauri.runtime = false;
  tauri.load.mockReset();
  tauri.save.mockReset();
  vi.stubGlobal('localStorage', new MemoryStorage());
});

describe('shared content repository contract', () => {
  it('round-trips the browser repository through the validated store', async () => {
    await saveContentStore([document], [DEFAULT_VOICE_PROFILE]);
    const loaded = await loadContentStore([]);

    expect(loaded?.documents).toHaveLength(1);
    expect(loaded?.documents[0]?.id).toBe(document.id);
    expect(loaded?.voices[0]?.id).toBe(DEFAULT_VOICE_PROFILE.id);
  });

  it('uses the native adapter and validates its result', async () => {
    const snapshot: ContentStoreSnapshot = {
      documents: [document],
      schemaVersion: 1,
      updatedAt: '2026-07-18T00:00:00.000Z',
      voices: [DEFAULT_VOICE_PROFILE],
    };
    tauri.runtime = true;
    tauri.load.mockResolvedValue(snapshot);
    tauri.save.mockResolvedValue();

    await expect(loadContentStore([])).resolves.toEqual(snapshot);
    await saveContentStore(snapshot.documents, snapshot.voices);
    expect(tauri.save).toHaveBeenCalledWith(
      expect.objectContaining({ documents: [document], schemaVersion: 1 }),
    );
  });

  it('rejects duplicate documents and malformed schema versions', () => {
    expect(() =>
      validateContentStoreSnapshot({
        documents: [document, document],
        schemaVersion: 1,
        updatedAt: 'now',
        voices: [DEFAULT_VOICE_PROFILE],
      }),
    ).toThrow('malformed or duplicated');
    expect(() =>
      validateContentStoreSnapshot({
        documents: [],
        schemaVersion: 2,
        voices: [],
      }),
    ).toThrow('unsupported');
  });
});
