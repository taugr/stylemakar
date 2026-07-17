import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ContentEvalCase } from './dataset-lib';
import { gradeDeterministic, loadDataset, wilsonInterval } from './dataset-lib';

const row: ContentEvalCase = {
  constraints: {
    allowedTransformations: [],
    forbiddenClaims: ['The rollout caused the increase.'],
    immutableBlocks: [{ kind: 'identifier', value: 'SM-42' }],
    mustPreserve: [
      {
        description: 'The result is uncertain.',
        id: 'uncertainty',
        kind: 'uncertainty',
        requiredTerms: ['may'],
      },
    ],
    mustPreserveVerbatim: ['June 2026'],
  },
  familyId: 'uncertainty',
  id: 'case-one',
  metadata: {
    difficulty: 'hard',
    domain: 'technical',
    length: 'sentence',
    license: 'CC0-1.0',
    origin: 'hand-authored',
    reviewedBy: ['reviewer'],
    structure: ['plain'],
  },
  profile: { id: 'direct-technical', referenceExamples: [] },
  rubric: {
    meaning: 'Preserve uncertainty.',
    minimumAcceptability: 'Keep details.',
    style: 'Be direct.',
  },
  schemaVersion: 1,
  source: 'The June 2026 result may apply to SM-42.',
  split: 'development',
};

describe('dataset v2 utilities', () => {
  it('grades deterministic details and forbidden claims independently', () => {
    expect(
      gradeDeterministic(row, 'The June 2026 result may apply to SM-42.'),
    ).toMatchObject({ pass: true, missing: [], forbiddenMatches: [] });
    expect(
      gradeDeterministic(row, 'The rollout caused the increase.'),
    ).toMatchObject({
      pass: false,
      forbiddenMatches: ['The rollout caused the increase.'],
    });
  });

  it('computes bounded Wilson confidence intervals', () => {
    expect(wilsonInterval(0, 0)).toEqual([0, 0]);
    const [lower, upper] = wilsonInterval(8, 10);
    expect(lower).toBeGreaterThan(0);
    expect(upper).toBeLessThanOrEqual(1);
    expect(lower).toBeLessThan(0.8);
    expect(upper).toBeGreaterThan(0.8);
  });

  it('rejects family leakage across splits', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stylemakar-dataset-'));
    fs.mkdirSync(path.join(root, 'cases'), { recursive: true });
    fs.mkdirSync(path.join(root, 'splits'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'manifest.json'),
      JSON.stringify({ caseFiles: ['cases/test.jsonl'] }),
    );
    fs.writeFileSync(
      path.join(root, 'cases/test.jsonl'),
      `${JSON.stringify(row)}\n${JSON.stringify({ ...row, id: 'case-two', split: 'holdout' })}`,
    );
    fs.writeFileSync(path.join(root, 'splits/development.txt'), 'case-one\n');
    fs.writeFileSync(path.join(root, 'splits/validation.txt'), '');
    fs.writeFileSync(path.join(root, 'splits/holdout.txt'), 'case-two\n');

    expect(loadDataset(root, root).errors).toContain(
      'Family leakage: uncertainty is in development and holdout.',
    );
  });

  it('separates pilot breadth from independent gold review', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stylemakar-dataset-'));
    fs.mkdirSync(path.join(root, 'cases'), { recursive: true });
    fs.mkdirSync(path.join(root, 'splits'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'manifest.json'),
      JSON.stringify({ caseFiles: ['cases/test.jsonl'] }),
    );
    fs.writeFileSync(path.join(root, 'cases/test.jsonl'), JSON.stringify(row));
    fs.writeFileSync(path.join(root, 'splits/development.txt'), 'case-one\n');
    fs.writeFileSync(path.join(root, 'splits/validation.txt'), '');
    fs.writeFileSync(path.join(root, 'splits/holdout.txt'), '');

    const result = loadDataset(root, root);
    expect(result.quotas.pilotBreadthMet).toBe(false);
    expect(result.quotas.pilotGoldMet).toBe(false);
    expect(result.quotas.independentlyReviewed).toBe(0);
  });
});
