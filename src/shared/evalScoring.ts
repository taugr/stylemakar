import {
  buildAntiGenericPolicy,
  checkAntiGeneric,
  DEFAULT_GENERIC_PHRASES,
} from './antiGeneric';
import type { StyleProfile } from './types';

export type IterationEvalCaseId =
  | 'anti-generic'
  | 'causation-caveat'
  | 'code-block';

export type DeterministicScore = {
  pass: boolean;
  checks: Array<{
    name: string;
    pass: boolean;
    detail: string;
  }>;
};

export type DeterministicCheckSpec =
  | {
      type: 'contains-all';
      name: string;
      values: string[];
    }
  | {
      type: 'contains-any';
      name: string;
      values: string[];
    }
  | {
      type: 'not-contains-any';
      name: string;
      values: string[];
    };

export type IterationLiftInput = {
  caseId: string;
  maxRewriteIterations: number;
  ok: boolean;
  deterministicPass: boolean;
  meaningPass: boolean;
  elapsedMs: number;
  finalStyleScore?: number;
};

export type IterationLiftSummary = {
  caseId: string;
  baselinePass: boolean;
  finalPass: boolean;
  helpful: boolean;
  styleDelta?: number;
  latencyDeltaMs?: number;
};

export type IterationMetricInput = {
  maxRewriteIterations: number;
  completed: boolean;
  stylePass: boolean;
  meaningPass: boolean;
  deterministicPass: boolean;
  ok: boolean;
  elapsedMs: number;
};

export type IterationMetricSummary = {
  maxRewriteIterations: number;
  total: number;
  completed: number;
  completionRate: number;
  stylePass: number;
  styleEligible: number;
  styleConformanceRate: number;
  meaningPass: number;
  meaningEligible: number;
  meaningRate: number;
  deterministicPass: number;
  deterministicEligible: number;
  deterministicRate: number;
  overallPass: number;
  overallRate: number;
  medianLatencyMs: number;
};

function includesAny(lower: string, values: string[]): boolean {
  return values.some((value) => lower.includes(value.toLowerCase()));
}

export function extractFencedCodeBlocks(text: string): string[] {
  return text.match(/```[\s\S]*?```/g) ?? [];
}

function scoreAntiGeneric(output: string): DeterministicScore {
  const profile: StyleProfile = {
    antiRules: ['Do not add hype, generic AI phrasing, or corporate polish.'],
    description: 'Direct technical style.',
    id: 'direct-technical',
    name: 'Direct Technical',
    rules: [],
  };
  const policy = buildAntiGenericPolicy(
    profile,
    DEFAULT_GENERIC_PHRASES.join(' '),
  );
  const check = checkAntiGeneric(output, policy);
  const matches = check.matches.map((match) => match.phrase);

  return {
    checks: [
      {
        detail:
          matches.length === 0
            ? 'No banned generic phrases found.'
            : `Found banned phrases: ${matches.join(', ')}`,
        name: 'generic phrases removed',
        pass: matches.length === 0,
      },
    ],
    pass: matches.length === 0,
  };
}

function scoreCausation(output: string): DeterministicScore {
  const lower = output.toLowerCase();
  const checks = [
    {
      detail: 'Output should mention causation or causal uncertainty.',
      name: 'causation caveat present',
      pass: includesAny(lower, ['causation', 'causal']),
    },
    {
      detail: 'Output should preserve that causation was not validated.',
      name: 'validation caveat present',
      pass: includesAny(lower, [
        'not validated',
        'not yet validated',
        'unvalidated',
        'has not been validated',
      ]),
    },
    {
      detail: 'Output should not state that the rollout caused the increase.',
      name: 'no causal claim',
      pass: !lower.includes('caused'),
    },
  ];

  return {
    checks,
    pass: checks.every((check) => check.pass),
  };
}

function scoreCodeBlock(source: string, output: string): DeterministicScore {
  const sourceBlocks = extractFencedCodeBlocks(source);
  const outputBlocks = extractFencedCodeBlocks(output);
  const exactBlocks =
    sourceBlocks.length === outputBlocks.length &&
    sourceBlocks.every((block, index) => block === outputBlocks[index]);
  const checks = [
    {
      detail: 'Output should preserve fenced code blocks exactly.',
      name: 'code blocks unchanged',
      pass: exactBlocks,
    },
    {
      detail: 'Output should preserve the endpoint.',
      name: 'endpoint preserved',
      pass: output.includes('http://localhost:1234/v1'),
    },
    {
      detail: 'Output should preserve the model name.',
      name: 'model name preserved',
      pass: output.includes('qwen3-14b'),
    },
  ];

  return {
    checks,
    pass: checks.every((check) => check.pass),
  };
}

export function scoreDeterministicChecks(
  output: string,
  specs: DeterministicCheckSpec[],
): DeterministicScore {
  const lower = output.toLowerCase();
  const checks = specs.map((spec) => {
    if (spec.type === 'contains-all') {
      const missing = spec.values.filter(
        (value) => !lower.includes(value.toLowerCase()),
      );

      return {
        detail:
          missing.length === 0
            ? `Found all required terms: ${spec.values.join(', ')}`
            : `Missing required terms: ${missing.join(', ')}`,
        name: spec.name,
        pass: missing.length === 0,
      };
    }

    if (spec.type === 'contains-any') {
      const pass = includesAny(lower, spec.values);

      return {
        detail: pass
          ? `Found at least one expected term from: ${spec.values.join(', ')}`
          : `Missing all expected terms: ${spec.values.join(', ')}`,
        name: spec.name,
        pass,
      };
    }

    const matches = spec.values.filter((value) =>
      lower.includes(value.toLowerCase()),
    );

    return {
      detail:
        matches.length === 0
          ? `No banned terms found from: ${spec.values.join(', ')}`
          : `Found banned terms: ${matches.join(', ')}`,
      name: spec.name,
      pass: matches.length === 0,
    };
  });

  return {
    checks,
    pass: checks.every((check) => check.pass),
  };
}

export function calculateIterationLiftSummaries(
  results: IterationLiftInput[],
  baselineIteration = 0,
  finalIteration = 2,
): IterationLiftSummary[] {
  const caseIds = [...new Set(results.map((result) => result.caseId))];

  return caseIds.map((caseId) => {
    const baseline = results.find(
      (result) =>
        result.caseId === caseId &&
        result.maxRewriteIterations === baselineIteration,
    );
    const final = results.find(
      (result) =>
        result.caseId === caseId &&
        result.maxRewriteIterations === finalIteration,
    );
    const styleDelta =
      typeof baseline?.finalStyleScore === 'number' &&
      typeof final?.finalStyleScore === 'number'
        ? final.finalStyleScore - baseline.finalStyleScore
        : undefined;
    const latencyDeltaMs =
      baseline && final ? final.elapsedMs - baseline.elapsedMs : undefined;
    const helpful =
      final?.meaningPass === true &&
      ((baseline?.ok === false && final.ok === true) ||
        (baseline?.deterministicPass === false &&
          final.deterministicPass === true) ||
        (typeof styleDelta === 'number' && styleDelta > 0));

    return {
      baselinePass: baseline?.ok === true,
      caseId,
      finalPass: final?.ok === true,
      helpful,
      latencyDeltaMs,
      styleDelta,
    };
  });
}

function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const value = sorted[middle];

  if (value === undefined) {
    return 0;
  }

  if (sorted.length % 2 === 1) {
    return value;
  }

  return ((sorted[middle - 1] ?? value) + value) / 2;
}

function rate(count: number, total: number): number {
  return total === 0 ? 0 : count / total;
}

export function calculateIterationMetricSummaries(
  results: IterationMetricInput[],
): IterationMetricSummary[] {
  const iterationLimits = [
    ...new Set(results.map((result) => result.maxRewriteIterations)),
  ].sort((left, right) => left - right);

  return iterationLimits.map((maxRewriteIterations) => {
    const matching = results.filter(
      (result) => result.maxRewriteIterations === maxRewriteIterations,
    );
    const completed = matching.filter((result) => result.completed);
    const styleEligible = completed.filter((result) => result.completed);
    const meaningEligible = completed;
    const deterministicEligible = completed;
    const stylePass = styleEligible.filter((result) => result.stylePass).length;
    const meaningPass = meaningEligible.filter(
      (result) => result.meaningPass,
    ).length;
    const deterministicPass = deterministicEligible.filter(
      (result) => result.deterministicPass,
    ).length;
    const overallPass = matching.filter((result) => result.ok).length;

    return {
      completed: completed.length,
      completionRate: rate(completed.length, matching.length),
      deterministicEligible: deterministicEligible.length,
      deterministicPass,
      deterministicRate: rate(deterministicPass, deterministicEligible.length),
      maxRewriteIterations,
      meaningEligible: meaningEligible.length,
      meaningPass,
      meaningRate: rate(meaningPass, meaningEligible.length),
      medianLatencyMs: median(matching.map((result) => result.elapsedMs)),
      overallPass,
      overallRate: rate(overallPass, matching.length),
      styleConformanceRate: rate(stylePass, styleEligible.length),
      styleEligible: styleEligible.length,
      stylePass,
      total: matching.length,
    };
  });
}

export function scoreIterationEvalOutput(
  caseId: IterationEvalCaseId,
  source: string,
  output: string,
): DeterministicScore {
  if (output.trim().length === 0) {
    return {
      checks: [
        {
          detail: 'Output was empty.',
          name: 'non-empty output',
          pass: false,
        },
      ],
      pass: false,
    };
  }

  switch (caseId) {
    case 'anti-generic':
      return scoreAntiGeneric(output);
    case 'causation-caveat':
      return scoreCausation(output);
    case 'code-block':
      return scoreCodeBlock(source, output);
  }
}
