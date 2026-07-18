import fs from 'node:fs';
import path from 'node:path';
import { CURATED_VOICE_COMPARISONS } from '../../src/shared/styleLab';

type PersonalisationCase = {
  id: string;
  familyId: string;
  comparisonId: string;
  profile: string;
  preferredOption: 'a' | 'b';
  expectedInstruction: string;
};

const datasetPath = path.resolve(
  process.cwd(),
  'evals/personalisation/cases.jsonl',
);
const rows = fs
  .readFileSync(datasetPath, 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((line) => JSON.parse(line) as PersonalisationCase);
const errors: string[] = [];
const ids = new Set<string>();

for (const row of rows) {
  if (ids.has(row.id)) errors.push(`Duplicate case ID: ${row.id}`);
  ids.add(row.id);
  const comparison = CURATED_VOICE_COMPARISONS.find(
    (candidate) => candidate.id === row.comparisonId,
  );

  if (!comparison) {
    errors.push(`${row.id}: unknown comparison ${row.comparisonId}`);
    continue;
  }

  if (comparison.dimension !== row.familyId) {
    errors.push(`${row.id}: family does not match comparison dimension`);
  }

  const candidate =
    row.preferredOption === 'a' ? comparison.candidateA : comparison.candidateB;
  if (candidate.instruction !== row.expectedInstruction) {
    errors.push(`${row.id}: expected instruction drifted`);
  }

  if (comparison.preservedDetails.length < 3) {
    errors.push(`${row.id}: comparison has insufficient meaning annotations`);
  }
}

for (const comparison of CURATED_VOICE_COMPARISONS) {
  const cases = rows.filter((row) => row.comparisonId === comparison.id);
  const choices = new Set(cases.map((row) => row.preferredOption));

  if (cases.length !== 2 || choices.size !== 2) {
    errors.push(
      `${comparison.id}: expected exactly two opposite target profiles`,
    );
  }
}

if (errors.length > 0) {
  throw new Error(`Personalisation eval failed:\n- ${errors.join('\n- ')}`);
}

console.log(
  JSON.stringify(
    {
      cases: rows.length,
      comparisons: CURATED_VOICE_COMPARISONS.length,
      dimensions: new Set(
        CURATED_VOICE_COMPARISONS.map((comparison) => comparison.dimension),
      ).size,
      meaningAnnotations: CURATED_VOICE_COMPARISONS.reduce(
        (total, comparison) => total + comparison.preservedDetails.length,
        0,
      ),
      status: 'pass',
    },
    null,
    2,
  ),
);
