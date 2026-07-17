import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_PROVIDER } from '../../src/shared/defaults';
import { completeJson } from '../../src/server/lmStudio';
import { loadDataset } from './dataset-lib';

const input = process.argv[2];
const judgeModel = process.env.STYLEMAKAR_JUDGE_MODEL;
const judgeBaseUrl =
  process.env.STYLEMAKAR_JUDGE_BASE_URL ?? DEFAULT_PROVIDER.baseUrl;
if (!input || !judgeModel) {
  throw new Error(
    'Usage: STYLEMAKAR_JUDGE_MODEL=<independent-model> tsx judge-dataset.ts <result.json>',
  );
}
const projectRoot = process.cwd();
const dataset = loadDataset(
  path.join(projectRoot, 'evals/dataset-v2'),
  projectRoot,
);
const run = JSON.parse(fs.readFileSync(input, 'utf8')) as {
  generator: { model: string };
  rows: Array<{ caseId: string; output: string; method: string }>;
};
if (run.generator.model === judgeModel) {
  throw new Error(
    'Release judging requires a model different from the generator.',
  );
}

const judged = [];
for (const result of run.rows) {
  const row = dataset.cases.find((candidate) => candidate.id === result.caseId);
  if (!row) throw new Error(`Unknown case ${result.caseId}.`);
  try {
    const verdict = await completeJson<{
      claims: Array<{ id: string; pass: boolean; reason: string }>;
      addedClaims: string[];
      sourceStyle: number;
      candidateStyle: number;
      acceptable: boolean;
      uncertainty: string;
    }>(
      [
        {
          role: 'system',
          content:
            'Return only valid JSON. Judge each atomic claim independently. Do not use lexical overlap as a proxy. Score source and candidate style from 0 to 100. Shape: {"claims":[{"id":"","pass":true,"reason":""}],"addedClaims":[],"sourceStyle":0,"candidateStyle":0,"acceptable":true,"uncertainty":""}.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            source: row.source,
            candidate: result.output,
            claims: row.constraints.mustPreserve,
            forbiddenClaims: row.constraints.forbiddenClaims,
            profile: row.profile,
            rubric: row.rubric,
          }),
        },
      ],
      { baseUrl: judgeBaseUrl, model: judgeModel, reasoningEffort: 'none' },
    );
    judged.push({
      ...result,
      judge: { baseUrl: judgeBaseUrl, model: judgeModel },
      verdict,
    });
  } catch (error) {
    judged.push({
      ...result,
      judge: { baseUrl: judgeBaseUrl, model: judgeModel },
      judgeError: {
        kind:
          error && typeof error === 'object' && 'kind' in error
            ? String(error.kind)
            : 'unknown',
        message: error instanceof Error ? error.message : 'Judge failed.',
      },
    });
  }
}

const output = input.replace(/\.json$/i, '.judged.json');
fs.writeFileSync(
  output,
  JSON.stringify({ judged, rubricVersion: '1.0.0' }, null, 2),
);
console.log(output);
