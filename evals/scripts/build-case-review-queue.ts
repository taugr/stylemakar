import fs from 'node:fs';
import path from 'node:path';
import { loadDataset } from './dataset-lib';

const projectRoot = process.cwd();
const datasetRoot = path.join(projectRoot, 'evals/dataset-v2');
const dataset = loadDataset(datasetRoot, projectRoot);
if (dataset.errors.length > 0) throw new Error(dataset.errors.join('\n'));
const records = fs
  .readFileSync(path.join(datasetRoot, 'reviews/case-reviews.jsonl'), 'utf8')
  .split(/\r?\n/)
  .filter(Boolean)
  .map(
    (line) =>
      JSON.parse(line) as {
        caseId: string;
        decision: string;
        reviewerId: string;
      },
  );
const approvals = new Map<string, Set<string>>();
for (const record of records) {
  if (record.decision !== 'approve') continue;
  const reviewers = approvals.get(record.caseId) ?? new Set<string>();
  reviewers.add(record.reviewerId);
  approvals.set(record.caseId, reviewers);
}
const queue = dataset.cases
  .filter((row) => (approvals.get(row.id)?.size ?? 0) < 2)
  .map((row) => ({
    annotations: {
      constraints: row.constraints,
      metadata: row.metadata,
      rubric: row.rubric,
    },
    caseId: row.id,
    existingIndependentApprovals: approvals.get(row.id)?.size ?? 0,
    response: {
      decision: null,
      disagreement: '',
      reviewerId: '',
    },
    source: row.source,
  }));
const output = path.join(
  projectRoot,
  'evals/results',
  `case-review-queue-${Date.now()}.json`,
);
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify({ queue }, null, 2));
console.log(output);
