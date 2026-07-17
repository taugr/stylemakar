import fs from 'node:fs';
import path from 'node:path';
import { gradeDeterministic, loadDataset } from './dataset-lib';

const input = process.argv[2];
if (!input) {
  throw new Error('Usage: tsx check-profile-differentiation.ts <result.json>');
}
const run = JSON.parse(fs.readFileSync(input, 'utf8')) as {
  rows: Array<{
    caseId: string;
    deterministic: { pass: boolean };
    method: string;
    output: string;
    profileId: string;
  }>;
};
const dataset = loadDataset(path.resolve('evals/dataset-v2'), process.cwd());
if (dataset.errors.length > 0) throw new Error(dataset.errors.join('\n'));
const rows = run.rows.filter(
  (row) =>
    row.caseId.startsWith('candidate-validation-profile-differentiation-') &&
    row.method === 'full-pipeline',
);
if (rows.length !== 3) {
  throw new Error('Profile differentiation requires all three profile rows.');
}
if (
  rows.some((row) => {
    const source = dataset.cases.find((item) => item.id === row.caseId);
    return !source || !gradeDeterministic(source, row.output).pass;
  })
) {
  throw new Error('A profile candidate failed deterministic meaning checks.');
}
const normalized = new Set(
  rows.map((row) => row.output.toLowerCase().replace(/\s+/g, ' ').trim()),
);
if (normalized.size !== rows.length) {
  throw new Error('Two profiles produced identical normalized output.');
}
console.log(
  `Profile differentiation passed for ${rows.map((row) => row.profileId).join(', ')}.`,
);
