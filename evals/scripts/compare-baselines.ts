import { spawnSync } from 'node:child_process';

const input = process.argv[2];
if (!input) throw new Error('Usage: tsx compare-baselines.ts <result.json>');
const result = spawnSync(
  process.execPath,
  ['--import', 'tsx', 'evals/scripts/build-eval-report.ts', input],
  { stdio: 'inherit' },
);
process.exitCode = result.status ?? 1;
