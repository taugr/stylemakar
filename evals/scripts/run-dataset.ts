import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_PROVIDER } from '../../src/shared/defaults';
import type { StyleProfile } from '../../src/shared/types';
import { completeJson, resolveModel } from '../../src/server/lmStudio';
import { runRewritePipeline } from '../../src/server/pipeline';
import { gradeDeterministic, loadDataset, type EvalSplit } from './dataset-lib';

type Method = 'no-op' | 'one-shot' | 'full-pipeline';
type RunRow = {
  caseId: string;
  split: EvalSplit;
  familyId: string;
  profileId: string;
  domain: string;
  difficulty: string;
  structure: string[];
  method: Method;
  output: string;
  deterministic: ReturnType<typeof gradeDeterministic>;
  latencyMs: number;
  modelCalls: number;
};

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const datasetRoot = path.join(projectRoot, 'evals/dataset-v2');
const validation = loadDataset(datasetRoot, projectRoot);
if (validation.errors.length > 0) throw new Error(validation.errors.join('\n'));

const split = (argument('split') ?? 'validation') as EvalSplit;
const methodFilter = (argument('method') ?? 'no-op').split(',') as Method[];
const caseFilter = argument('case');
const familyFilter = argument('family');
const profileFilter = argument('profile');
const domainFilter = argument('domain');
const difficultyFilter = argument('difficulty');
const structureFilter = argument('structure');
const baseUrl = argument('base-url') ?? DEFAULT_PROVIDER.baseUrl;
const configuredModel = argument('model');
const repeat = Math.max(1, Number.parseInt(argument('repeat') ?? '1', 10));
const model = methodFilter.some((method) => method !== 'no-op')
  ? await resolveModel({ baseUrl, model: configuredModel })
  : (configuredModel ?? 'no-op');
const provider = { baseUrl, model, reasoningEffort: 'none' as const };
const selectedCases = validation.cases.filter(
  (row) =>
    row.split === split &&
    (!caseFilter || row.id === caseFilter) &&
    (!familyFilter || row.familyId === familyFilter) &&
    (!profileFilter || row.profile.id === profileFilter) &&
    (!domainFilter || row.metadata.domain === domainFilter) &&
    (!difficultyFilter || row.metadata.difficulty === difficultyFilter) &&
    (!structureFilter || row.metadata.structure.includes(structureFilter)),
);
const rows: RunRow[] = [];

for (let repetition = 0; repetition < repeat; repetition += 1) {
  for (const row of selectedCases) {
    const profile = row.profile.inlineDefinition
      ? (row.profile.inlineDefinition as StyleProfile)
      : (JSON.parse(
          fs.readFileSync(
            path.resolve(projectRoot, row.profile.definitionPath!),
            'utf8',
          ),
        ) as StyleProfile);
    const samplePath = path.join(
      projectRoot,
      'evals/fixtures/samples',
      `${row.profile.id}-samples.json`,
    );
    const referenceExamples =
      row.profile.referenceExamples.length > 0
        ? row.profile.referenceExamples
        : fs.existsSync(samplePath)
          ? (JSON.parse(fs.readFileSync(samplePath, 'utf8')) as string[])
          : [];

    for (const method of methodFilter) {
      const startedAt = performance.now();
      let output = row.source;
      let modelCalls = 0;
      const modelClient = {
        completeJson: async <T>(
          messages: Parameters<typeof completeJson>[0],
        ): Promise<T> => {
          modelCalls += 1;
          return completeJson<T>(messages, provider);
        },
      };

      if (method === 'one-shot') {
        const result = await modelClient.completeJson<{
          rewrittenText: string;
        }>([
          {
            content:
              'Return only valid JSON with shape {"rewrittenText":"..."}. Rewrite once to match the supplied profile while preserving every fact, caveat, condition, name, date, number, quote, and immutable block.',
            role: 'system',
          },
          {
            content: `${JSON.stringify({ profile, referenceExamples })}\n\nSource:\n${row.source}`,
            role: 'user',
          },
        ]);
        output = result.rewrittenText;
      } else if (method === 'full-pipeline') {
        output = (
          await runRewritePipeline(
            {
              document: row.source,
              options: { includeDebug: true },
              provider,
              referenceExamples,
              styleProfile: profile,
            },
            modelClient,
          )
        ).content;
      }

      rows.push({
        caseId: row.id,
        deterministic: gradeDeterministic(row, output),
        difficulty: row.metadata.difficulty,
        domain: row.metadata.domain,
        familyId: row.familyId,
        latencyMs: Math.round(performance.now() - startedAt),
        method,
        modelCalls,
        output,
        profileId: row.profile.id,
        split: row.split,
        structure: row.metadata.structure,
      });
    }
  }
}

const resultsDir = path.join(projectRoot, 'evals/results');
fs.mkdirSync(resultsDir, { recursive: true });
const outputPath = path.join(
  resultsDir,
  `dataset-v2-${split}-${Date.now()}.json`,
);
fs.writeFileSync(
  outputPath,
  JSON.stringify(
    {
      datasetVersion: '2.0.0-pilot',
      generator: { baseUrl, model },
      methods: methodFilter,
      repeat,
      rows,
      split,
    },
    null,
    2,
  ),
);
console.log(outputPath);
