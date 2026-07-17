import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDataset } from './dataset-lib';

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const datasetRoot = path.join(projectRoot, 'evals/dataset-v2');
const result = loadDataset(datasetRoot, projectRoot);

console.log(`Dataset v2: ${result.cases.length} cases`);
console.log(JSON.stringify(result.coverage, null, 2));
console.log(`Pilot quotas: ${JSON.stringify(result.quotas)}`);
console.log(`Holdout checksum: ${result.holdoutChecksum}`);
for (const warning of result.warnings) console.warn(`warning: ${warning}`);
for (const error of result.errors) console.error(`error: ${error}`);

if (result.errors.length > 0) process.exitCode = 1;
