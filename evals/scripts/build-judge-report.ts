import fs from 'node:fs';
import path from 'node:path';
import { loadDataset, wilsonInterval } from './dataset-lib';

type JudgedRow = {
  caseId: string;
  method: string;
  judgeError?: { kind: string; message: string };
  verdict?: {
    acceptable: boolean;
    addedClaims: string[];
    candidateStyle: number;
    claims: Array<{ id: string; pass: boolean }>;
    sourceStyle: number;
  };
};

const input = process.argv[2];
if (!input) throw new Error('Usage: tsx build-judge-report.ts <judged.json>');
const run = JSON.parse(fs.readFileSync(input, 'utf8')) as {
  judged: JudgedRow[];
  rubricVersion: string;
};
const dataset = loadDataset(path.resolve('evals/dataset-v2'), process.cwd());
if (dataset.errors.length > 0) throw new Error(dataset.errors.join('\n'));
const highRiskKinds = new Set([
  'negation',
  'uncertainty',
  'causation',
  'condition',
  'recommendation-strength',
  'scope',
  'attribution',
  'sequence',
]);

const methods = [...new Set(run.judged.map((row) => row.method))];
const summaries = methods.map((method) => {
  const rows = run.judged.filter((row) => row.method === method);
  const completed = rows.filter(
    (row): row is JudgedRow & { verdict: NonNullable<JudgedRow['verdict']> } =>
      Boolean(row.verdict),
  );
  const claims = completed.flatMap((row) => row.verdict.claims);
  const passedClaims = claims.filter((claim) => claim.pass).length;
  const hallucinated = completed.filter(
    (row) => row.verdict.addedClaims.length > 0,
  ).length;
  const acceptable = completed.filter((row) => row.verdict.acceptable).length;
  const highRiskRows = completed.filter((row) => {
    const datasetRow = dataset.cases.find((item) => item.id === row.caseId);
    return datasetRow?.constraints.mustPreserve.some((claim) =>
      highRiskKinds.has(claim.kind),
    );
  });
  const highRiskFailures = highRiskRows.filter((row) =>
    row.verdict.claims.some((claim) => !claim.pass),
  ).length;
  return {
    acceptableRate: acceptable / Math.max(1, completed.length),
    acceptableRate95: wilsonInterval(acceptable, completed.length),
    atomicClaimPreservationRate: passedClaims / Math.max(1, claims.length),
    completionRate: completed.length / Math.max(1, rows.length),
    hallucinatedClaimRate: hallucinated / Math.max(1, completed.length),
    highRiskFailureRate: highRiskFailures / Math.max(1, highRiskRows.length),
    method,
    styleImprovement:
      completed.reduce(
        (total, row) =>
          total + (row.verdict.candidateStyle - row.verdict.sourceStyle),
        0,
      ) / Math.max(1, completed.length),
    total: rows.length,
  };
});
const report = {
  independentlyJudgedRows: run.judged.length,
  rubricVersion: run.rubricVersion,
  summaries,
};
const base = input.replace(/\.json$/i, '');
fs.writeFileSync(`${base}.report.json`, JSON.stringify(report, null, 2));
fs.writeFileSync(
  `${base}.report.md`,
  [
    '# Independent judge report',
    '',
    `Rubric: ${run.rubricVersion}`,
    '',
    '| Method | Complete | Atomic claims | Hallucinated claims | High-risk failures | Style lift | Acceptable |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...summaries.map(
      (summary) =>
        `| ${summary.method} | ${(summary.completionRate * 100).toFixed(1)}% | ${(summary.atomicClaimPreservationRate * 100).toFixed(1)}% | ${(summary.hallucinatedClaimRate * 100).toFixed(1)}% | ${(summary.highRiskFailureRate * 100).toFixed(1)}% | ${summary.styleImprovement.toFixed(1)} | ${(summary.acceptableRate * 100).toFixed(1)}% |`,
    ),
  ].join('\n'),
);
console.log(`${base}.report.md`);
