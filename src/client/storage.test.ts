import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_VOICE_PROFILE } from '../shared/defaults';
import type { VoiceProfileRecord } from '../shared/types';
import {
  createAppBackup,
  loadVoiceProfiles,
  parseVoiceProfileImport,
  parseAppBackup,
  saveVoiceProfiles,
  validateVoiceProfile,
} from './storage';

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage());
});

describe('voice profile storage', () => {
  it('starts with a separate bundled starter voice', () => {
    expect(loadVoiceProfiles()).toEqual([DEFAULT_VOICE_PROFILE]);
    expect(loadVoiceProfiles()[0]?.isStarter).toBe(true);
  });

  it('round-trips rules and ordered examples through export JSON', () => {
    const voice: VoiceProfileRecord = {
      antiRules: ['Avoid hype.'],
      createdAt: '2026-07-18T00:00:00.000Z',
      description: 'Concise and calm.',
      examples: [
        {
          createdAt: '2026-07-18T00:00:00.000Z',
          id: 'example-b',
          label: 'Second draft',
          text: 'Keep the result concrete.',
        },
        {
          createdAt: '2026-07-18T00:00:00.000Z',
          id: 'example-a',
          label: 'First draft',
          text: 'State the constraint first.',
        },
      ],
      id: 'calm-technical',
      name: 'Calm technical',
      rules: ['Use short sentences.'],
      schemaVersion: 1,
      updatedAt: '2026-07-18T00:00:00.000Z',
    };

    saveVoiceProfiles([voice]);
    expect(loadVoiceProfiles()).toEqual([voice]);
    expect(parseVoiceProfileImport(JSON.stringify(voice))).toEqual(voice);
  });

  it('rejects malformed imports and duplicate example IDs', () => {
    expect(() => parseVoiceProfileImport('not json')).toThrow('valid JSON');
    expect(() =>
      validateVoiceProfile({
        ...DEFAULT_VOICE_PROFILE,
        examples: [
          DEFAULT_VOICE_PROFILE.examples[0]!,
          DEFAULT_VOICE_PROFILE.examples[0]!,
        ],
      }),
    ).toThrow('unique');
  });

  it('round-trips documents, versions, and voices in a full backup', () => {
    const document = {
      createdAt: '2026-07-18T00:00:00.000Z',
      id: 'document-1',
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
    const backup = createAppBackup([document], [DEFAULT_VOICE_PROFILE]);

    expect(parseAppBackup(JSON.stringify(backup))).toEqual(backup);
  });
});
