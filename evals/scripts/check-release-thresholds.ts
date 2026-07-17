import fs from 'node:fs';

const [contentPath, judgePath] = process.argv.slice(2);
if (!contentPath || !judgePath) {
  throw new Error(
    'Usage: tsx check-release-thresholds.ts <content.report.json> <judge.report.json>',
  );
}
const content = JSON.parse(fs.readFileSync(contentPath, 'utf8')) as {
  aggregate: Array<{
    concreteDetailRate: number;
    method: string;
    passRate: number;
  }>;
  baselineLift?: { deterministicPassRate: number };
  newFailures: unknown[];
};
const judge = JSON.parse(fs.readFileSync(judgePath, 'utf8')) as {
  summaries: Array<{
    completionRate: number;
    highRiskFailureRate: number;
    method: string;
  }>;
};
const full = content.aggregate.find((item) => item.method === 'full-pipeline');
const oneShot = content.aggregate.find((item) => item.method === 'one-shot');
const judgedFull = judge.summaries.find(
  (item) => item.method === 'full-pipeline',
);
if (!full || !oneShot || !judgedFull) {
  throw new Error('Release gate requires one-shot and full-pipeline reports.');
}
const failures: string[] = [];
if (judgedFull.completionRate < 0.98)
  failures.push('independent-judge completion is below 98%');
if (full.passRate < 0.98)
  failures.push('completion/constraint pass rate is below 98%');
if (full.concreteDetailRate < 0.99)
  failures.push('concrete-detail preservation is below 99%');
if (judgedFull.highRiskFailureRate >= 0.01)
  failures.push('high-risk semantic failure is not below 1%');
if (full.passRate < oneShot.passRate)
  failures.push('full-pipeline meaning performance is worse than one-shot');
if (content.newFailures.length > 0)
  failures.push(
    `${content.newFailures.length} named-baseline regressions remain`,
  );

if (failures.length > 0) {
  throw new Error(`Release efficacy gate failed:\n- ${failures.join('\n- ')}`);
}
console.log('Release efficacy thresholds passed.');
