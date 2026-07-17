import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export type EvalSplit = 'development' | 'validation' | 'holdout';
export type AtomicMeaningClaim = {
  id: string;
  description: string;
  kind: string;
  requiredTerms?: string[];
};
export type ContentEvalCase = {
  schemaVersion: 1;
  id: string;
  familyId: string;
  templateId?: string;
  split: EvalSplit;
  source: string;
  profile: {
    id: string;
    definitionPath?: string;
    inlineDefinition?: unknown;
    referenceExamples: string[];
  };
  constraints: {
    mustPreserve: AtomicMeaningClaim[];
    mustPreserveVerbatim: string[];
    immutableBlocks: Array<{ kind: string; value: string }>;
    forbiddenClaims: string[];
    allowedTransformations: string[];
  };
  rubric: {
    meaning: string;
    style: string;
    minimumAcceptability: string;
  };
  metadata: {
    domain: string;
    length: string;
    structure: string[];
    difficulty: string;
    origin: string;
    license: string;
    reviewedBy: string[];
    adjudicatedBy?: string;
  };
};

export type DatasetQuotas = {
  cases: number;
  difficult: number;
  structuredOrMultiParagraph: number;
  profiles: Record<string, number>;
  independentlyReviewed: number;
  pilotBreadthMet: boolean;
  pilotGoldMet: boolean;
};

type CaseReviewRecord = {
  caseId: string;
  decision: 'approve' | 'changes-requested';
  reviewerId: string;
};

export type DatasetValidation = {
  cases: ContentEvalCase[];
  errors: string[];
  warnings: string[];
  holdoutChecksum: string;
  coverage: Record<string, Record<string, number>>;
  quotas: DatasetQuotas;
};

export type DeterministicGrade = {
  pass: boolean;
  preserved: string[];
  missing: string[];
  forbiddenMatches: string[];
};

const SPLITS = new Set(['development', 'validation', 'holdout']);
const DIFFICULTIES = new Set(['basic', 'medium', 'hard', 'adversarial']);

function increment(
  coverage: Record<string, Record<string, number>>,
  dimension: string,
  value: string,
): void {
  coverage[dimension] ??= {};
  coverage[dimension][value] = (coverage[dimension][value] ?? 0) + 1;
}

function normalize(value: string): string {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
}

function tokenSimilarity(left: string, right: string): number {
  const leftTokens = new Set(
    normalize(left)
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean),
  );
  const rightTokens = new Set(
    normalize(right)
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean),
  );
  const union = new Set([...leftTokens, ...rightTokens]);
  if (union.size === 0) return 1;
  let intersection = 0;
  for (const token of leftTokens) if (rightTokens.has(token)) intersection += 1;
  return intersection / union.size;
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === 'string')
  );
}

function validateCaseShape(
  candidate: unknown,
  location: string,
  errors: string[],
): candidate is ContentEvalCase {
  if (!candidate || typeof candidate !== 'object') {
    errors.push(`${location}: row must be an object.`);
    return false;
  }

  const row = candidate as Partial<ContentEvalCase>;
  const requiredStrings: Array<[string, unknown]> = [
    ['id', row.id],
    ['familyId', row.familyId],
    ['source', row.source],
    ['split', row.split],
  ];

  for (const [field, value] of requiredStrings) {
    if (typeof value !== 'string' || value.trim() === '') {
      errors.push(`${location}: ${field} is required.`);
    }
  }

  if (row.schemaVersion !== 1) {
    errors.push(`${location}: schemaVersion must be 1.`);
  }

  if (!row.split || !SPLITS.has(row.split)) {
    errors.push(`${location}: invalid split.`);
  }

  if (!row.profile?.id || !Array.isArray(row.profile.referenceExamples)) {
    errors.push(`${location}: profile id and referenceExamples are required.`);
  }

  if (
    !row.constraints ||
    !Array.isArray(row.constraints.mustPreserve) ||
    !isStringArray(row.constraints.mustPreserveVerbatim) ||
    !Array.isArray(row.constraints.immutableBlocks) ||
    !isStringArray(row.constraints.forbiddenClaims) ||
    !isStringArray(row.constraints.allowedTransformations)
  ) {
    errors.push(`${location}: constraints are incomplete.`);
  }

  if (
    !row.rubric?.meaning ||
    !row.rubric.style ||
    !row.rubric.minimumAcceptability
  ) {
    errors.push(`${location}: all rubric fields are required.`);
  }

  if (
    !row.metadata?.domain ||
    !row.metadata.length ||
    !row.metadata.origin ||
    !row.metadata.license ||
    !isStringArray(row.metadata.structure) ||
    !isStringArray(row.metadata.reviewedBy) ||
    row.metadata.reviewedBy.length === 0 ||
    !DIFFICULTIES.has(row.metadata.difficulty)
  ) {
    errors.push(`${location}: metadata is incomplete.`);
  }

  return errors.every((error) => !error.startsWith(`${location}:`));
}

export function loadDataset(
  datasetRoot: string,
  projectRoot: string,
): DatasetValidation {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(datasetRoot, 'manifest.json'), 'utf8'),
  ) as { caseFiles?: string[]; holdoutChecksum?: string };
  const errors: string[] = [];
  const warnings: string[] = [];
  const cases: ContentEvalCase[] = [];

  for (const relativeFile of manifest.caseFiles ?? []) {
    const file = path.join(datasetRoot, relativeFile);
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);

    lines.forEach((line, index) => {
      if (!line.trim()) return;
      const location = `${relativeFile}:${index + 1}`;

      try {
        const candidate = JSON.parse(line) as unknown;
        if (validateCaseShape(candidate, location, errors)) {
          cases.push(candidate);
        }
      } catch (error) {
        errors.push(
          `${location}: invalid JSON: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      }
    });
  }

  const ids = new Set<string>();
  const normalizedSources = new Map<
    string,
    { id: string; templateId?: string }
  >();
  const familySplits = new Map<string, EvalSplit>();
  const templateSplits = new Map<string, EvalSplit>();
  const coverage: Record<string, Record<string, number>> = {};

  for (const row of cases) {
    if (ids.has(row.id)) errors.push(`Duplicate case id: ${row.id}.`);
    ids.add(row.id);

    const sourceKey = normalize(row.source);
    const priorSource = normalizedSources.get(sourceKey);
    if (priorSource && priorSource.templateId !== row.templateId)
      warnings.push(`Exact duplicate source: ${priorSource.id} and ${row.id}.`);
    normalizedSources.set(sourceKey, {
      id: row.id,
      templateId: row.templateId,
    });

    const priorFamilySplit = familySplits.get(row.familyId);
    if (priorFamilySplit && priorFamilySplit !== row.split) {
      errors.push(
        `Family leakage: ${row.familyId} is in ${priorFamilySplit} and ${row.split}.`,
      );
    }
    familySplits.set(row.familyId, row.split);

    if (row.templateId) {
      const priorTemplateSplit = templateSplits.get(row.templateId);
      if (priorTemplateSplit && priorTemplateSplit !== row.split) {
        errors.push(`Template leakage: ${row.templateId} crosses splits.`);
      }
      templateSplits.set(row.templateId, row.split);
    }

    if (row.constraints.mustPreserve.length === 0) {
      warnings.push(`${row.id}: no atomic meaning claims.`);
    }
    if (
      row.profile.definitionPath &&
      !fs.existsSync(path.resolve(projectRoot, row.profile.definitionPath))
    ) {
      errors.push(`${row.id}: missing profile ${row.profile.definitionPath}.`);
    }

    increment(coverage, 'split', row.split);
    increment(coverage, 'profile', row.profile.id);
    increment(coverage, 'domain', row.metadata.domain);
    increment(coverage, 'difficulty', row.metadata.difficulty);
    for (const structure of row.metadata.structure)
      increment(coverage, 'structure', structure);
  }

  for (let leftIndex = 0; leftIndex < cases.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < cases.length;
      rightIndex += 1
    ) {
      const left = cases[leftIndex];
      const right = cases[rightIndex];
      if (!left || !right || left.familyId === right.familyId) continue;
      if (tokenSimilarity(left.source, right.source) >= 0.9) {
        warnings.push(`Near-duplicate source: ${left.id} and ${right.id}.`);
      }
    }
  }

  for (const split of SPLITS) {
    const splitPath = path.join(datasetRoot, 'splits', `${split}.txt`);
    const manifestIds = new Set(
      fs
        .readFileSync(splitPath, 'utf8')
        .split(/\r?\n/)
        .map((id) => id.trim())
        .filter(Boolean),
    );
    const rowIds = new Set(
      cases.filter((row) => row.split === split).map((row) => row.id),
    );
    for (const id of rowIds)
      if (!manifestIds.has(id))
        errors.push(`${id}: missing from ${split} manifest.`);
    for (const id of manifestIds)
      if (!rowIds.has(id))
        errors.push(`${id}: split manifest has no matching row.`);
  }

  const holdoutChecksum = crypto
    .createHash('sha256')
    .update(
      cases
        .filter((row) => row.split === 'holdout')
        .sort((left, right) => left.id.localeCompare(right.id))
        .map((row) => JSON.stringify(row))
        .join('\n'),
    )
    .digest('hex');

  if (
    manifest.holdoutChecksum &&
    manifest.holdoutChecksum !== 'pending' &&
    manifest.holdoutChecksum !== holdoutChecksum
  ) {
    errors.push(
      `Holdout checksum changed: expected ${manifest.holdoutChecksum}, received ${holdoutChecksum}.`,
    );
  }

  const difficult = cases.filter((row) =>
    ['hard', 'adversarial'].includes(row.metadata.difficulty),
  ).length;
  const structuredOrMultiParagraph = cases.filter(
    (row) =>
      row.metadata.length === 'multi-paragraph' ||
      row.metadata.structure.some((structure) => structure !== 'plain'),
  ).length;
  const profiles = coverage.profile ?? {};
  const reviewPath = path.join(datasetRoot, 'reviews/case-reviews.jsonl');
  const approvedReviewers = new Map<string, Set<string>>();
  if (fs.existsSync(reviewPath)) {
    const seenReviews = new Set<string>();
    fs.readFileSync(reviewPath, 'utf8')
      .split(/\r?\n/)
      .filter(Boolean)
      .forEach((line, index) => {
        try {
          const review = JSON.parse(line) as CaseReviewRecord;
          if (!ids.has(review.caseId)) {
            errors.push(
              `reviews/case-reviews.jsonl:${index + 1}: unknown case ${review.caseId}.`,
            );
            return;
          }
          if (
            !review.reviewerId ||
            !['approve', 'changes-requested'].includes(review.decision)
          ) {
            errors.push(
              `reviews/case-reviews.jsonl:${index + 1}: invalid review record.`,
            );
            return;
          }
          const key = `${review.caseId}:${review.reviewerId}`;
          if (seenReviews.has(key)) {
            errors.push(
              `reviews/case-reviews.jsonl:${index + 1}: duplicate reviewer decision for ${review.caseId}.`,
            );
          }
          seenReviews.add(key);
          if (review.decision === 'approve') {
            const reviewers =
              approvedReviewers.get(review.caseId) ?? new Set<string>();
            reviewers.add(review.reviewerId);
            approvedReviewers.set(review.caseId, reviewers);
          }
        } catch {
          errors.push(`reviews/case-reviews.jsonl:${index + 1}: invalid JSON.`);
        }
      });
  }
  const independentlyReviewed = cases.filter(
    (row) => (approvedReviewers.get(row.id)?.size ?? 0) >= 2,
  ).length;
  const pilotBreadthMet =
    cases.length >= 90 &&
    difficult >= 30 &&
    structuredOrMultiParagraph >= 25 &&
    ['direct-technical', 'student-feedback', 'casual-explanatory'].every(
      (profile) => (profiles[profile] ?? 0) >= 30,
    );
  const quotas: DatasetQuotas = {
    cases: cases.length,
    difficult,
    independentlyReviewed,
    pilotBreadthMet,
    pilotGoldMet: pilotBreadthMet && independentlyReviewed === cases.length,
    profiles,
    structuredOrMultiParagraph,
  };

  return { cases, coverage, errors, holdoutChecksum, quotas, warnings };
}

export function gradeDeterministic(
  row: ContentEvalCase,
  output: string,
): DeterministicGrade {
  const normalizedOutput = normalize(output);
  const required = [
    ...row.constraints.mustPreserveVerbatim,
    ...row.constraints.immutableBlocks.map((block) => block.value),
    ...row.constraints.mustPreserve.flatMap(
      (claim) => claim.requiredTerms ?? [],
    ),
  ];
  const missing = required.filter(
    (value) => !normalizedOutput.includes(normalize(value)),
  );
  const forbiddenMatches = row.constraints.forbiddenClaims.filter((claim) =>
    normalizedOutput.includes(normalize(claim)),
  );

  return {
    forbiddenMatches,
    missing,
    pass:
      output.trim().length > 0 &&
      missing.length === 0 &&
      forbiddenMatches.length === 0,
    preserved: required.filter((value) => !missing.includes(value)),
  };
}

export function wilsonInterval(
  successes: number,
  total: number,
): [number, number] {
  if (total === 0) return [0, 0];
  const z = 1.96;
  const proportion = successes / total;
  const denominator = 1 + (z * z) / total;
  const centre = proportion + (z * z) / (2 * total);
  const margin =
    z *
    Math.sqrt((proportion * (1 - proportion) + (z * z) / (4 * total)) / total);
  return [(centre - margin) / denominator, (centre + margin) / denominator];
}
