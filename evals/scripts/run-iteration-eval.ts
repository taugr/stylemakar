/// <reference types="node" />

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { EvalRewriteResponse } from '../../src/shared/types';
import {
  type DeterministicScore,
  type IterationEvalCaseId,
  scoreIterationEvalOutput,
} from '../../src/shared/evalScoring';

type IterationCase = {
  id: IterationEvalCaseId;
  label: string;
  source: string;
  styleProfileId: string;
};

type IterationRunResult = {
  caseId: IterationEvalCaseId;
  label: string;
  maxRewriteIterations: number;
  ok: boolean;
  status?: number;
  error?: string;
  elapsedMs: number;
  finalText: string;
  attemptsUsed: number;
  styleScores: number[];
  feedback: string[];
  finalStyleScore?: number;
  meaningPass: boolean;
  deterministic: DeterministicScore;
};

const dirname = path.dirname(fileURLToPath(import.meta.url));
const evalsRoot = path.resolve(dirname, '..');
const projectRoot = path.resolve(evalsRoot, '..');
const resultsRoot = path.join(evalsRoot, 'results');
const reportPath = path.join(projectRoot, 'docs/reports/eval-findings.md');
const apiBaseUrl =
  process.env.STYLEMAKAR_API_BASE_URL ?? 'http://127.0.0.1:5174';
const evalModel = process.env.STYLEMAKAR_EVAL_MODEL;
const evalProviderId =
  process.env.STYLEMAKAR_EVAL_PROVIDER_ID ??
  process.env.STYLEMAKAR_EVAL_BASE_URL ??
  'lmstudio';
const evalReasoningEffort =
  process.env.STYLEMAKAR_EVAL_REASONING_EFFORT ?? 'none';
const iterationLimits = [0, 1, 2];

const cases: IterationCase[] = [
  {
    id: 'anti-generic',
    label: 'Anti-generic rewriting',
    source:
      'It is important to note that this robust and comprehensive solution leverages modern AI capabilities to deliver a seamless user experience.',
    styleProfileId: 'direct-technical',
  },
  {
    id: 'causation-caveat',
    label: 'Causation caveat preservation',
    source:
      'The rollout increased acceptance rates, although causation has not yet been validated.',
    styleProfileId: 'direct-technical',
  },
  {
    id: 'code-block',
    label: 'Code block preservation',
    source: [
      'The provider config should use an OpenAI-compatible endpoint.',
      '',
      '```json',
      '{',
      '  "baseUrl": "http://localhost:1234/v1",',
      '  "model": "qwen3-14b"',
      '}',
      '```',
      '',
      'The surrounding explanation can be rewritten, but the JSON block should not change.',
    ].join('\n'),
    styleProfileId: 'direct-technical',
  },
];

function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

function latestStyleScore(result: EvalRewriteResponse): number | undefined {
  const attempts = result.debug.segments.flatMap((segment) => segment.attempts);
  return attempts.at(-1)?.styleScore;
}

async function postEvalRequest(
  testCase: IterationCase,
  maxRewriteIterations: number,
): Promise<IterationRunResult> {
  const startedAt = Date.now();
  const response = await fetch(`${apiBaseUrl}/api/eval/rewrite`, {
    body: JSON.stringify({
      options: {
        maxRewriteIterations,
        reasoningEffort: evalReasoningEffort,
        runFinalSmoothing: false,
        runMeaningCheck: true,
      },
      model: evalModel,
      providerId: evalProviderId,
      source: testCase.source,
      styleProfileId: testCase.styleProfileId,
    }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });
  const elapsedMs = Date.now() - startedAt;
  const text = await response.text();

  if (!response.ok) {
    let error = text;

    try {
      const parsed = JSON.parse(text) as { error?: string };
      error = parsed.error ?? text;
    } catch {
      // Keep the raw response text.
    }

    return {
      attemptsUsed: 0,
      caseId: testCase.id,
      deterministic: {
        checks: [
          {
            detail: error,
            name: 'endpoint success',
            pass: false,
          },
        ],
        pass: false,
      },
      elapsedMs,
      error,
      feedback: [],
      finalText: '',
      label: testCase.label,
      maxRewriteIterations,
      meaningPass: false,
      ok: false,
      status: response.status,
      styleScores: [],
    };
  }

  const body = JSON.parse(text) as EvalRewriteResponse;
  const attempts = body.debug.segments.flatMap((segment) => segment.attempts);
  const meaningPass = body.debug.segments.every(
    (segment) => segment.meaningCheck?.pass !== false,
  );
  const deterministic = scoreIterationEvalOutput(
    testCase.id,
    testCase.source,
    body.finalText,
  );
  const ok = meaningPass && deterministic.pass && body.finalText.trim() !== '';

  return {
    attemptsUsed: attempts.length,
    caseId: testCase.id,
    deterministic,
    elapsedMs,
    feedback: attempts
      .map((attempt) => attempt.feedback)
      .filter((feedback): feedback is string => Boolean(feedback)),
    finalStyleScore: latestStyleScore(body),
    finalText: body.finalText,
    label: testCase.label,
    maxRewriteIterations,
    meaningPass,
    ok,
    status: response.status,
    styleScores: attempts
      .map((attempt) => attempt.styleScore)
      .filter((score): score is number => typeof score === 'number'),
  };
}

function buildRows(
  results: IterationRunResult[],
): Array<Record<string, string>> {
  return results.map((result) => ({
    attempts: String(result.attemptsUsed),
    case: result.label,
    deterministic: result.deterministic.pass ? 'pass' : 'fail',
    elapsed: formatSeconds(result.elapsedMs),
    iter: String(result.maxRewriteIterations),
    meaning: result.meaningPass ? 'pass' : 'fail',
    result: result.ok ? 'pass' : 'fail',
    style:
      typeof result.finalStyleScore === 'number'
        ? String(result.finalStyleScore)
        : 'n/a',
  }));
}

function summarizeLift(results: IterationRunResult[]): string[] {
  return cases.map((testCase) => {
    const caseResults = results.filter(
      (result) => result.caseId === testCase.id,
    );
    const baseline = caseResults.find(
      (result) => result.maxRewriteIterations === 0,
    );
    const final = caseResults.find(
      (result) => result.maxRewriteIterations === 2,
    );
    const baselineScore = baseline?.finalStyleScore;
    const finalScore = final?.finalStyleScore;
    const scoreDelta =
      typeof baselineScore === 'number' && typeof finalScore === 'number'
        ? finalScore - baselineScore
        : undefined;
    const latencyDelta =
      baseline && final ? final.elapsedMs - baseline.elapsedMs : undefined;

    return [
      `- ${testCase.label}: ${baseline?.ok ? 'pass' : 'fail'} at 0 iterations, ${final?.ok ? 'pass' : 'fail'} at 2 iterations`,
      typeof scoreDelta === 'number' ? `style delta ${scoreDelta}` : undefined,
      typeof latencyDelta === 'number'
        ? `latency delta ${formatSeconds(latencyDelta)}`
        : undefined,
    ]
      .filter(Boolean)
      .join('; ');
  });
}

function appendReport(
  results: IterationRunResult[],
  artifactPath: string,
): void {
  const now = new Date().toISOString();
  const rows = buildRows(results)
    .map(
      (row) =>
        `| ${row.case} | ${row.iter} | ${row.attempts} | ${row.style} | ${row.meaning} | ${row.deterministic} | ${row.elapsed} | ${row.result} |`,
    )
    .join('\n');
  const section = [
    '',
    '## Iteration Lift Results',
    '',
    `Date: ${now}`,
    '',
    `Artifact: \`${path.relative(projectRoot, artifactPath)}\``,
    '',
    '| Case | Iteration Limit | Attempts | Final Style Score | Meaning | Deterministic | Elapsed | Result |',
    '| --- | ---: | ---: | ---: | --- | --- | ---: | --- |',
    rows,
    '',
    '### Lift Summary',
    '',
    ...summarizeLift(results),
    '',
  ].join('\n');

  fs.appendFileSync(reportPath, section);
}

async function main(): Promise<void> {
  const results: IterationRunResult[] = [];

  for (const testCase of cases) {
    for (const maxRewriteIterations of iterationLimits) {
      results.push(await postEvalRequest(testCase, maxRewriteIterations));
    }
  }

  fs.mkdirSync(resultsRoot, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const artifactPath = path.join(
    resultsRoot,
    `iteration-lift-${timestamp}.json`,
  );

  fs.writeFileSync(
    artifactPath,
    `${JSON.stringify(
      {
        apiBaseUrl,
        iterationLimits,
        results,
        runAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
  );
  appendReport(results, artifactPath);

  console.table(buildRows(results));
  console.log(`Wrote ${path.relative(projectRoot, artifactPath)}`);
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
