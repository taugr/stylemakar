import fs from 'node:fs';
import { wilsonInterval } from './dataset-lib';

type ResultRow = {
  caseId: string;
  familyId: string;
  profileId: string;
  domain: string;
  difficulty: string;
  method: string;
  latencyMs: number;
  modelCalls: number;
  structure?: string[];
  deterministic: { pass: boolean; missing: string[]; preserved: string[] };
};

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const input = process.argv[2];
if (!input) throw new Error('Usage: tsx build-eval-report.ts <result.json>');
const run = JSON.parse(fs.readFileSync(input, 'utf8')) as {
  datasetVersion: string;
  split: string;
  generator: { model: string };
  rows: ResultRow[];
};

function summarize(rows: ResultRow[]): Array<{
  method: string;
  passed: number;
  total: number;
  passRate: number;
  confidence95: [number, number];
  medianLatencyMs: number;
  p95LatencyMs: number;
  meanModelCalls: number;
  concreteDetailRate: number;
}> {
  const methods = [...new Set(rows.map((row) => row.method))];
  return methods.map((method) => {
    const selected = rows.filter((row) => row.method === method);
    const passed = selected.filter((row) => row.deterministic.pass).length;
    const latency = selected.map((row) => row.latencyMs).sort((a, b) => a - b);
    const preserved = selected.reduce(
      (total, row) => total + row.deterministic.preserved.length,
      0,
    );
    const missing = selected.reduce(
      (total, row) => total + row.deterministic.missing.length,
      0,
    );
    return {
      confidence95: wilsonInterval(passed, selected.length),
      concreteDetailRate: preserved / Math.max(1, preserved + missing),
      meanModelCalls:
        selected.reduce((total, row) => total + row.modelCalls, 0) /
        Math.max(1, selected.length),
      medianLatencyMs: latency[Math.floor(latency.length / 2)] ?? 0,
      p95LatencyMs: latency[Math.ceil(latency.length * 0.95) - 1] ?? 0,
      method,
      passed,
      passRate: passed / Math.max(1, selected.length),
      total: selected.length,
    };
  });
}

const aggregate = summarize(run.rows);
const slices = ['profileId', 'domain', 'difficulty'] as const;
const sliceReport = Object.fromEntries(
  slices.map((dimension) => [
    dimension,
    Object.fromEntries(
      [...new Set(run.rows.map((row) => row[dimension]))].map((value) => [
        value,
        summarize(run.rows.filter((row) => row[dimension] === value)),
      ]),
    ),
  ]),
);
sliceReport.structure = Object.fromEntries(
  [...new Set(run.rows.flatMap((row) => row.structure ?? []))].map(
    (structure) => [
      structure,
      summarize(run.rows.filter((row) => row.structure?.includes(structure))),
    ],
  ),
);
const worstFamilies = [...new Set(run.rows.map((row) => row.familyId))]
  .map((familyId) => ({
    familyId,
    ...summarize(run.rows.filter((row) => row.familyId === familyId))[0],
  }))
  .sort((left, right) => (left.passRate ?? 0) - (right.passRate ?? 0))
  .slice(0, 10);
const fullPipeline = aggregate.find((item) => item.method === 'full-pipeline');
const oneShot = aggregate.find((item) => item.method === 'one-shot');
const baselineLift =
  fullPipeline && oneShot
    ? {
        concreteDetailRate:
          fullPipeline.concreteDetailRate - oneShot.concreteDetailRate,
        deterministicPassRate: fullPipeline.passRate - oneShot.passRate,
      }
    : undefined;
const baselineInput = argument('baseline');
let newFailures: Array<{ caseId: string; method: string }> = [];
if (baselineInput) {
  const baseline = JSON.parse(fs.readFileSync(baselineInput, 'utf8')) as {
    rows: ResultRow[];
  };
  const priorPasses = new Set(
    baseline.rows
      .filter((row) => row.deterministic.pass)
      .map((row) => `${row.caseId}:${row.method}`),
  );
  newFailures = run.rows
    .filter(
      (row) =>
        !row.deterministic.pass &&
        priorPasses.has(`${row.caseId}:${row.method}`),
    )
    .map((row) => ({ caseId: row.caseId, method: row.method }));
}
const report = {
  aggregate,
  baselineLift,
  newFailures,
  sliceReport,
  worstFamilies,
};
const base = input.replace(/\.json$/i, '');
fs.writeFileSync(`${base}.report.json`, JSON.stringify(report, null, 2));
fs.writeFileSync(
  `${base}.report.md`,
  [
    `# Dataset v2 ${run.split} report`,
    '',
    `Dataset: ${run.datasetVersion}  `,
    `Generator: ${run.generator.model}`,
    '',
    '| Method | Pass | Rate | Details | 95% CI | Median / p95 latency | Calls/case |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...aggregate.map(
      (item) =>
        `| ${item.method} | ${item.passed}/${item.total} | ${(item.passRate * 100).toFixed(1)}% | ${(item.concreteDetailRate * 100).toFixed(1)}% | ${(item.confidence95[0] * 100).toFixed(1)}–${(item.confidence95[1] * 100).toFixed(1)}% | ${item.medianLatencyMs} / ${item.p95LatencyMs} ms | ${item.meanModelCalls.toFixed(1)} |`,
    ),
    '',
    baselineLift
      ? `Full-pipeline lift over one-shot: ${(baselineLift.deterministicPassRate * 100).toFixed(1)} percentage points deterministic pass rate; ${(baselineLift.concreteDetailRate * 100).toFixed(1)} points concrete-detail preservation.`
      : 'Run one-shot and full-pipeline together to calculate baseline lift.',
    `New regressions versus named baseline: ${newFailures.length}.`,
    '',
    'Deterministic checks measure annotated concrete constraints only. Independent semantic/style judge and human-review results must be reported separately.',
  ].join('\n'),
);
console.log(`${base}.report.md`);
