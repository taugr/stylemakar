/// <reference types="node" />

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  calculateIterationLiftSummaries,
  calculateIterationMetricSummaries,
  type DeterministicCheckSpec,
  type DeterministicScore,
  scoreDeterministicChecks,
} from '../../src/shared/evalScoring';
import type { EvalRewriteResponse } from '../../src/shared/types';

type MatrixCase = {
  id: string;
  label: string;
  level: 'sentence' | 'paragraph';
  styleProfileId:
    | 'direct-technical'
    | 'student-feedback'
    | 'casual-explanatory';
  source: string;
  tags: string[];
  checks: DeterministicCheckSpec[];
};

type MatrixRunResult = {
  caseId: string;
  label: string;
  level: MatrixCase['level'];
  styleProfileId: MatrixCase['styleProfileId'];
  tags: string[];
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
const caseFilter = process.env.STYLEMAKAR_EVAL_CASE_FILTER;
const iterationLimits = [0, 1, 2];
const stylePassThreshold = 85;

const cases: MatrixCase[] = [
  {
    checks: [
      {
        name: 'generic phrases removed',
        type: 'not-contains-any',
        values: [
          'it is important to note',
          'robust and comprehensive',
          'robust, comprehensive',
          'leverage',
          'seamless user experience',
        ],
      },
    ],
    id: 'direct-sentence-anti-generic',
    label: 'Direct sentence: generic AI prose',
    level: 'sentence',
    source:
      'It is important to note that this robust and comprehensive solution leverages modern AI capabilities to deliver a seamless user experience.',
    styleProfileId: 'direct-technical',
    tags: ['anti-generic', 'sentence'],
  },
  {
    checks: [
      {
        name: 'uncertainty preserved',
        type: 'contains-any',
        values: ['may', 'might', 'could', 'not yet', 'more examples'],
      },
      {
        name: 'not overclaimed',
        type: 'not-contains-any',
        values: ['definitely', 'proven', 'guaranteed'],
      },
    ],
    id: 'direct-sentence-uncertainty',
    label: 'Direct sentence: uncertain claim',
    level: 'sentence',
    source:
      'This may reduce review time, but we need more examples before treating it as a reliable improvement.',
    styleProfileId: 'direct-technical',
    tags: ['uncertainty', 'sentence'],
  },
  {
    checks: [
      {
        name: 'corporate phrasing removed',
        type: 'not-contains-any',
        values: [
          'cutting-edge',
          'actionable insights',
          'empower organizations',
          'accelerate growth',
        ],
      },
      {
        name: 'technical substance retained',
        type: 'contains-any',
        values: ['workflow', 'decision', 'data', 'analytics'],
      },
    ],
    id: 'direct-paragraph-corporate-product',
    label: 'Direct paragraph: corporate product prose',
    level: 'paragraph',
    source:
      'Our solution leverages cutting-edge AI technology to optimize workflow efficiency and deliver actionable insights. By harnessing advanced analytics, we empower organizations to make data-driven decisions that accelerate growth across every team.',
    styleProfileId: 'direct-technical',
    tags: ['anti-generic', 'paragraph-rhythm'],
  },
  {
    checks: [
      {
        name: 'recommendation retained',
        type: 'contains-any',
        values: ['avoid', 'skip', 'hold off', 'keep'],
      },
      {
        name: 'condition retained',
        type: 'contains-any',
        values: ['clear retrieval problem', 'retrieval problem', 'until'],
      },
      {
        name: 'not absolute',
        type: 'not-contains-any',
        values: ['never use', 'vector databases are bad', 'must use'],
      },
    ],
    id: 'direct-paragraph-recommendation-caveat',
    label: 'Direct paragraph: recommendation caveat',
    level: 'paragraph',
    source:
      'We should probably keep the first version simple and avoid adding a vector database until there is a clear retrieval problem. That keeps the implementation easier to test while we learn what users actually search for.',
    styleProfileId: 'direct-technical',
    tags: ['uncertainty', 'recommendation', 'paragraph'],
  },
  {
    checks: [
      {
        name: 'specific feedback',
        type: 'contains-any',
        values: ['specific', 'example', 'explain', 'show'],
      },
      {
        name: 'no vague praise',
        type: 'not-contains-any',
        values: ['great job', 'amazing work', 'fantastic'],
      },
    ],
    id: 'feedback-sentence-vague-praise',
    label: 'Feedback sentence: vague praise',
    level: 'sentence',
    source:
      'Great job on this section, it is really nice and shows strong effort.',
    styleProfileId: 'student-feedback',
    tags: ['feedback-specificity', 'sentence'],
  },
  {
    checks: [
      {
        name: 'actionable feedback',
        type: 'contains-any',
        values: ['next step', 'revise', 'add', 'explain'],
      },
      {
        name: 'not overly warm',
        type: 'not-contains-any',
        values: [
          'incredible',
          'so proud',
          'amazing',
          'wonderful',
          'high quality',
          'high-quality',
          'feel proud',
          'proud of this work',
          'strong grasp',
          'level of detail',
          'technical or structural',
          'technical detail',
          'data point',
          'well-constructed',
        ],
      },
    ],
    id: 'feedback-sentence-overwarm',
    label: 'Feedback sentence: overly warm',
    level: 'sentence',
    source:
      'I am so proud of this incredible work, and you should feel amazing about how wonderful your answer is.',
    styleProfileId: 'student-feedback',
    tags: ['feedback-specificity', 'tone-control', 'sentence'],
  },
  {
    checks: [
      {
        name: 'organization issue retained',
        type: 'contains-any',
        values: ['responsibilities', 'separate', 'function', 'test'],
      },
      {
        name: 'constructive recommendation',
        type: 'contains-any',
        values: ['next step', 'separate', 'split', 'recommendation'],
      },
    ],
    id: 'feedback-paragraph-code-organization',
    label: 'Feedback paragraph: code organization',
    level: 'paragraph',
    source:
      'The current implementation works, but it mixes too many responsibilities into one function. It would be easier to test if the parsing, rewriting, and grading logic were separated.',
    styleProfileId: 'student-feedback',
    tags: ['feedback-specificity', 'paragraph'],
  },
  {
    checks: [
      {
        name: 'required terms retained',
        type: 'contains-all',
        values: ['Aram', '42', 'June 2026'],
      },
      {
        name: 'feedback remains specific',
        type: 'contains-any',
        values: ['submission', 'workshop', 'review', 'specific'],
      },
    ],
    id: 'feedback-paragraph-submission-specifics',
    label: 'Feedback paragraph: submission specifics',
    level: 'paragraph',
    source:
      'The June 2026 pilot included 42 students across three workshops, with Aram reviewing the final submissions. The feedback should help each student understand which part of the work needs revision.',
    styleProfileId: 'student-feedback',
    tags: ['feedback-specificity', 'required-terms', 'paragraph'],
  },
  {
    checks: [
      {
        name: 'casual language',
        type: 'contains-any',
        values: ['basically', 'simple', 'think of', 'means'],
      },
      {
        name: 'not formal',
        type: 'not-contains-any',
        values: ['therefore', 'utilize', 'facilitate', 'aforementioned'],
      },
    ],
    id: 'casual-sentence-overformal',
    label: 'Casual sentence: over-formal explanation',
    level: 'sentence',
    source:
      'The aforementioned configuration facilitates improved alignment between the provider interface and downstream execution requirements.',
    styleProfileId: 'casual-explanatory',
    tags: ['casual-explainer', 'sentence'],
  },
  {
    checks: [
      {
        name: 'tradeoff retained',
        type: 'contains-any',
        values: ['trade-off', 'tradeoff', 'but', 'cost'],
      },
      {
        name: 'not corporate',
        type: 'not-contains-any',
        values: ['unlock', 'seamless', 'transformative'],
      },
    ],
    id: 'casual-sentence-tradeoff',
    label: 'Casual sentence: tradeoff',
    level: 'sentence',
    source:
      'The tradeoff is that caching makes repeated requests faster, but it can also hide stale data when the underlying record changes.',
    styleProfileId: 'casual-explanatory',
    tags: ['casual-explainer', 'tradeoff', 'sentence'],
  },
  {
    checks: [
      {
        name: 'concept retained',
        type: 'contains-any',
        values: ['queue', 'job', 'request', 'worker'],
      },
      {
        name: 'practical explanation',
        type: 'contains-any',
        values: ['example', 'think of', 'basically', 'means'],
      },
    ],
    id: 'casual-paragraph-technical-concept',
    label: 'Casual paragraph: technical concept',
    level: 'paragraph',
    source:
      'A job queue lets the server accept a request quickly and process the expensive work later. A worker can then pick up each job, retry it if needed, and keep the user-facing request from timing out.',
    styleProfileId: 'casual-explanatory',
    tags: ['casual-explainer', 'paragraph'],
  },
  {
    checks: [
      {
        name: 'workflow tradeoff retained',
        type: 'contains-any',
        values: ['manual', 'automatic', 'trade-off', 'tradeoff', 'mistake'],
      },
      {
        name: 'not quirky',
        type: 'not-contains-any',
        values: ['super duper', 'wild ride', 'magic'],
      },
    ],
    id: 'casual-paragraph-workflow-tradeoff',
    label: 'Casual paragraph: workflow tradeoff',
    level: 'paragraph',
    source:
      'A manual review step slows the workflow down, but it catches mistakes that an automatic rewrite can miss. Removing that step makes the process faster, but it also means users need stronger checks before publishing.',
    styleProfileId: 'casual-explanatory',
    tags: ['casual-explainer', 'tradeoff', 'paragraph'],
  },
];

function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

function truncate(value: string, limit = 360): string {
  return value.length > limit ? `${value.slice(0, limit).trimEnd()}...` : value;
}

function latestStyleScore(result: EvalRewriteResponse): number | undefined {
  const attempts = result.debug.segments.flatMap((segment) => segment.attempts);
  return attempts.at(-1)?.styleScore;
}

async function postEvalRequest(
  testCase: MatrixCase,
  maxRewriteIterations: number,
): Promise<MatrixRunResult> {
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
        checks: [{ detail: error, name: 'endpoint success', pass: false }],
        pass: false,
      },
      elapsedMs,
      error,
      feedback: [],
      finalText: '',
      label: testCase.label,
      level: testCase.level,
      maxRewriteIterations,
      meaningPass: false,
      ok: false,
      status: response.status,
      styleProfileId: testCase.styleProfileId,
      styleScores: [],
      tags: testCase.tags,
    };
  }

  const body = JSON.parse(text) as EvalRewriteResponse;
  const attempts = body.debug.segments.flatMap((segment) => segment.attempts);
  const meaningPass = body.debug.segments.every(
    (segment) => segment.meaningCheck?.pass !== false,
  );
  const deterministic = scoreDeterministicChecks(
    body.finalText,
    testCase.checks,
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
    level: testCase.level,
    maxRewriteIterations,
    meaningPass,
    ok,
    status: response.status,
    styleProfileId: testCase.styleProfileId,
    styleScores: attempts
      .map((attempt) => attempt.styleScore)
      .filter((score): score is number => typeof score === 'number'),
    tags: testCase.tags,
  };
}

function buildRows(results: MatrixRunResult[]): Array<Record<string, string>> {
  return results.map((result) => ({
    attempts: String(result.attemptsUsed),
    case: result.label,
    deterministic: result.deterministic.pass ? 'pass' : 'fail',
    elapsed: formatSeconds(result.elapsedMs),
    iter: String(result.maxRewriteIterations),
    level: result.level,
    meaning: result.meaningPass ? 'pass' : 'fail',
    result: result.ok ? 'pass' : 'fail',
    styleConforms:
      typeof result.finalStyleScore === 'number' &&
      result.finalStyleScore >= stylePassThreshold
        ? 'pass'
        : result.attemptsUsed > 0
          ? 'fail'
          : 'n/a',
    style:
      typeof result.finalStyleScore === 'number'
        ? String(result.finalStyleScore)
        : 'n/a',
    styleProfile: result.styleProfileId,
  }));
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function splitMetricRows(results: MatrixRunResult[]): string[] {
  const summaries = calculateIterationMetricSummaries(
    results.map((result) => ({
      completed: result.attemptsUsed > 0,
      deterministicPass: result.deterministic.pass,
      elapsedMs: result.elapsedMs,
      maxRewriteIterations: result.maxRewriteIterations,
      meaningPass: result.meaningPass,
      ok: result.ok,
      stylePass:
        typeof result.finalStyleScore === 'number' &&
        result.finalStyleScore >= stylePassThreshold,
    })),
  );

  return summaries.map(
    (summary) =>
      `| ${summary.maxRewriteIterations} | ${summary.completed}/${summary.total} (${formatPercent(summary.completionRate)}) | ${summary.stylePass}/${summary.styleEligible} (${formatPercent(summary.styleConformanceRate)}) | ${summary.meaningPass}/${summary.meaningEligible} (${formatPercent(summary.meaningRate)}) | ${summary.deterministicPass}/${summary.deterministicEligible} (${formatPercent(summary.deterministicRate)}) | ${summary.overallPass}/${summary.total} (${formatPercent(summary.overallRate)}) | ${formatSeconds(summary.medianLatencyMs)} |`,
  );
}

function selectedExamples(results: MatrixRunResult[]): string[] {
  const summaries = calculateIterationLiftSummaries(
    results.map((result) => ({
      caseId: result.caseId,
      deterministicPass: result.deterministic.pass,
      elapsedMs: result.elapsedMs,
      finalStyleScore: result.finalStyleScore,
      maxRewriteIterations: result.maxRewriteIterations,
      meaningPass: result.meaningPass,
      ok: result.ok,
    })),
  );
  const improved = summaries
    .filter((summary) => summary.helpful)
    .map((summary) => {
      const testCase = cases.find(
        (candidate) => candidate.id === summary.caseId,
      );
      const baseline = results.find(
        (result) =>
          result.caseId === summary.caseId && result.maxRewriteIterations === 0,
      );
      const final = results.find(
        (result) =>
          result.caseId === summary.caseId && result.maxRewriteIterations === 2,
      );

      return [
        `### Improvement: ${testCase?.label ?? summary.caseId}`,
        '',
        `0 iterations: ${baseline?.ok ? 'pass' : 'fail'}; 2 iterations: ${final?.ok ? 'pass' : 'fail'}; style delta ${summary.styleDelta ?? 'n/a'}; latency delta ${typeof summary.latencyDeltaMs === 'number' ? formatSeconds(summary.latencyDeltaMs) : 'n/a'}`,
        '',
        '```text',
        truncate(final?.finalText ?? ''),
        '```',
        '',
      ].join('\n');
    });
  const failures = summaries
    .filter((summary) => !summary.finalPass)
    .slice(0, 3)
    .map((summary) => {
      const testCase = cases.find(
        (candidate) => candidate.id === summary.caseId,
      );
      const final = results.find(
        (result) =>
          result.caseId === summary.caseId && result.maxRewriteIterations === 2,
      );

      return [
        `### Failure: ${testCase?.label ?? summary.caseId}`,
        '',
        final?.error
          ? `Error: ${final.error}`
          : `Failed checks: ${final?.deterministic.checks
              .filter((check) => !check.pass)
              .map((check) => check.name)
              .join(', ')}`,
        '',
        '```text',
        truncate(final?.finalText ?? ''),
        '```',
        '',
      ].join('\n');
    });

  return [...improved.slice(0, 2), ...failures];
}

function liftSummary(results: MatrixRunResult[]): string[] {
  const summaries = calculateIterationLiftSummaries(
    results.map((result) => ({
      caseId: result.caseId,
      deterministicPass: result.deterministic.pass,
      elapsedMs: result.elapsedMs,
      finalStyleScore: result.finalStyleScore,
      maxRewriteIterations: result.maxRewriteIterations,
      meaningPass: result.meaningPass,
      ok: result.ok,
    })),
  );

  return summaries.map((summary) => {
    const testCase = cases.find((candidate) => candidate.id === summary.caseId);

    return [
      `- ${testCase?.label ?? summary.caseId}: ${summary.baselinePass ? 'pass' : 'fail'} at 0, ${summary.finalPass ? 'pass' : 'fail'} at 2`,
      summary.helpful ? 'helpful' : 'not helpful',
      typeof summary.styleDelta === 'number'
        ? `style delta ${summary.styleDelta}`
        : undefined,
      typeof summary.latencyDeltaMs === 'number'
        ? `latency delta ${formatSeconds(summary.latencyDeltaMs)}`
        : undefined,
    ]
      .filter(Boolean)
      .join('; ');
  });
}

function appendReport(results: MatrixRunResult[], artifactPath: string): void {
  const rows = buildRows(results)
    .map(
      (row) =>
        `| ${row.styleProfile} | ${row.level} | ${row.case} | ${row.iter} | ${row.attempts} | ${row.style} | ${row.styleConforms} | ${row.meaning} | ${row.deterministic} | ${row.elapsed} | ${row.result} |`,
    )
    .join('\n');
  const section = [
    '',
    '## Expanded Iteration Matrix Results',
    '',
    `Date: ${new Date().toISOString()}`,
    '',
    `Artifact: \`${path.relative(projectRoot, artifactPath)}\``,
    '',
    `Style conformance threshold: ${stylePassThreshold}`,
    '',
    '| Style | Level | Case | Iteration Limit | Attempts | Final Style Score | Style Conforms | Meaning | Deterministic | Elapsed | Result |',
    '| --- | --- | --- | ---: | ---: | ---: | --- | --- | --- | ---: | --- |',
    rows,
    '',
    '### Split Metrics',
    '',
    '| Iteration Limit | Completion | Style Conformance Among Completed | Meaning Among Completed | Deterministic Among Completed | Overall Pass | Median Latency |',
    '| ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...splitMetricRows(results),
    '',
    '### Lift Summary',
    '',
    ...liftSummary(results),
    '',
    '### Selected Examples',
    '',
    ...selectedExamples(results),
    '',
  ].join('\n');

  fs.appendFileSync(reportPath, section);
}

async function main(): Promise<void> {
  const results: MatrixRunResult[] = [];
  const selectedCases = caseFilter
    ? cases.filter(
        (testCase) =>
          testCase.id.includes(caseFilter) ||
          testCase.label.toLowerCase().includes(caseFilter.toLowerCase()) ||
          testCase.styleProfileId === caseFilter ||
          testCase.tags.includes(caseFilter),
      )
    : cases;

  for (const testCase of selectedCases) {
    for (const maxRewriteIterations of iterationLimits) {
      results.push(await postEvalRequest(testCase, maxRewriteIterations));
    }
  }

  fs.mkdirSync(resultsRoot, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const artifactPath = path.join(
    resultsRoot,
    `iteration-matrix-${timestamp}.json`,
  );

  fs.writeFileSync(
    artifactPath,
    `${JSON.stringify(
      {
        apiBaseUrl,
        caseFilter,
        cases: selectedCases,
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
