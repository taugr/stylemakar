/// <reference types="node" />

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { StyleProfile } from '../../src/shared/types';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const evalsRoot = path.resolve(dirname, '..');
const profilesRoot = path.join(evalsRoot, 'fixtures/profiles');
const samplesRoot = path.join(evalsRoot, 'fixtures/samples');
const manifestPath = path.join(evalsRoot, '.seeded-eval-data.json');

const expectedProfileIds = [
  'direct-technical',
  'student-feedback',
  'casual-explanatory',
];

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function assertProfile(profile: StyleProfile, expectedId: string): void {
  if (profile.id !== expectedId) {
    throw new Error(`Expected ${expectedId} profile, got ${profile.id}.`);
  }

  if (
    !profile.name ||
    !profile.description ||
    profile.rules.length === 0 ||
    profile.antiRules.length === 0
  ) {
    throw new Error(`Profile ${expectedId} is incomplete.`);
  }
}

const seeded = expectedProfileIds.map((profileId) => {
  const profilePath = path.join(profilesRoot, `${profileId}.json`);
  const samplesPath = path.join(samplesRoot, `${profileId}-samples.json`);
  const profile = readJson<StyleProfile>(profilePath);
  const samples = readJson<string[]>(samplesPath);

  assertProfile(profile, profileId);

  if (!Array.isArray(samples) || samples.length === 0) {
    throw new Error(`Profile ${profileId} has no reference samples.`);
  }

  return {
    profileId,
    profilePath: path.relative(evalsRoot, profilePath),
    sampleCount: samples.length,
    samplesPath: path.relative(evalsRoot, samplesPath),
  };
});

fs.writeFileSync(
  manifestPath,
  `${JSON.stringify({ seededAt: new Date().toISOString(), seeded }, null, 2)}\n`,
);

console.log(`Seeded ${seeded.length} eval style profiles.`);
