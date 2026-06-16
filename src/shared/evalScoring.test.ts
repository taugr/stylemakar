import { describe, expect, it } from 'vitest';
import {
  buildAntiGenericFeedback,
  buildAntiGenericPolicy,
  checkAntiGeneric,
  shouldApplyAntiGenericGate,
} from './antiGeneric';
import {
  calculateIterationLiftSummaries,
  calculateIterationMetricSummaries,
  extractFencedCodeBlocks,
  scoreDeterministicChecks,
  scoreIterationEvalOutput,
} from './evalScoring';
import {
  applyStudentFeedbackMeaningPolicy,
  buildStudentFeedbackFeedback,
  buildStudentFeedbackPolicy,
  checkStudentFeedback,
  shouldApplyStudentFeedbackGate,
} from './studentFeedback';
import type { StyleProfile } from './types';

const directProfile: StyleProfile = {
  antiRules: ['Do not add hype, generic AI phrasing, or corporate polish.'],
  description: 'Concise direct technical prose.',
  id: 'direct-technical',
  name: 'Direct Technical',
  rules: ['Use plain words.'],
};

const neutralProfile: StyleProfile = {
  antiRules: ['Keep punctuation unchanged.'],
  description: 'Neutral copy edit.',
  id: 'neutral',
  name: 'Neutral',
  rules: ['Keep the same tone.'],
};

const studentFeedbackProfile: StyleProfile = {
  antiRules: ['Do not use vague praise or invent details.'],
  description: 'Specific, fair student feedback.',
  id: 'student-feedback',
  name: 'Student Feedback',
  rules: ['Explain the next improvement clearly.'],
};

describe('eval scoring helpers', () => {
  it('passes direct causation caveat preservation', () => {
    const score = scoreIterationEvalOutput(
      'causation-caveat',
      'The rollout increased acceptance rates, although causation has not yet been validated.',
      'Acceptance rates increased following the rollout; however, causation remains unvalidated.',
    );

    expect(score.pass).toBe(true);
  });

  it('fails anti-generic output that keeps marketing phrases', () => {
    const score = scoreIterationEvalOutput(
      'anti-generic',
      '',
      'This robust, comprehensive solution uses modern AI capabilities to provide a seamless user experience.',
    );

    expect(score.pass).toBe(false);
    expect(score.checks[0]?.detail).toContain('robust, comprehensive');
    expect(score.checks[0]?.detail).toContain('seamless user experience');
  });

  it('builds anti-generic policy and feedback for direct profiles', () => {
    const policy = buildAntiGenericPolicy(
      directProfile,
      'This robust and comprehensive solution leverages AI.',
    );
    const check = checkAntiGeneric(
      'This robust and comprehensive solution leverages AI.',
      policy,
    );

    expect(shouldApplyAntiGenericGate(directProfile)).toBe(true);
    expect(shouldApplyAntiGenericGate(neutralProfile)).toBe(false);
    expect(policy.active).toBe(true);
    expect(check.pass).toBe(false);
    expect(buildAntiGenericFeedback(check)).toContain(
      'Remove these generic phrases',
    );
    expect(buildAntiGenericFeedback(check)).toContain(
      'robust and comprehensive',
    );
  });

  it('builds student-feedback policy and catches unsupported details', () => {
    const policy = buildStudentFeedbackPolicy(studentFeedbackProfile);
    const check = checkStudentFeedback(
      'The subsection is excellent. Explain the formula in the next step.',
      'This section shows effort.',
      policy,
    );

    expect(shouldApplyStudentFeedbackGate(studentFeedbackProfile)).toBe(true);
    expect(shouldApplyStudentFeedbackGate(neutralProfile)).toBe(false);
    expect(policy.active).toBe(true);
    expect(check.pass).toBe(false);
    expect(buildStudentFeedbackFeedback(check)).toContain(
      'Remove unsupported feedback details',
    );
    expect(buildStudentFeedbackFeedback(check)).toContain(
      'Replace vague praise',
    );
  });

  it('applies student-feedback meaning policy without weakening concrete fidelity', () => {
    const policy = buildStudentFeedbackPolicy(studentFeedbackProfile);

    expect(
      applyStudentFeedbackMeaningPolicy(
        {
          addedClaims: [
            'The rewrite asks the student to add one specific example and explain why it works.',
          ],
          changedMeaning: [],
          missingDetails: [
            'so proud',
            'warmth and vague praise',
            'Aram reviewed 42 submissions in June 2026',
          ],
          pass: false,
          riskLevel: 'medium',
        },
        policy,
      ),
    ).toMatchObject({
      addedClaims: [],
      missingDetails: ['Aram reviewed 42 submissions in June 2026'],
      pass: false,
      riskLevel: 'medium',
    });

    expect(
      applyStudentFeedbackMeaningPolicy(
        {
          addedClaims: [],
          changedMeaning: [],
          missingDetails: ['amazing work', 'wonderful answer'],
          pass: false,
          riskLevel: 'medium',
        },
        policy,
      ),
    ).toMatchObject({
      missingDetails: [],
      pass: true,
      riskLevel: 'low',
    });

    expect(
      applyStudentFeedbackMeaningPolicy(
        {
          addedClaims: [
            'The rewrite says the student should revise the formula in the next project.',
          ],
          changedMeaning: [],
          missingDetails: [],
          pass: false,
          riskLevel: 'high',
        },
        policy,
      ),
    ).toMatchObject({
      addedClaims: [
        'The rewrite says the student should revise the formula in the next project.',
      ],
      pass: false,
      riskLevel: 'high',
    });

    expect(
      applyStudentFeedbackMeaningPolicy(
        {
          addedClaims: [],
          changedMeaning: [],
          missingDetails: [
            'Warm Springs field notes',
            'warm-up exercise',
            'warmth and vague praise',
          ],
          pass: false,
          riskLevel: 'high',
        },
        policy,
      ),
    ).toMatchObject({
      missingDetails: ['Warm Springs field notes', 'warm-up exercise'],
      pass: false,
      riskLevel: 'high',
    });
  });

  it('requires exact fenced code block preservation', () => {
    const source = [
      'Use this config.',
      '',
      '```json',
      '{',
      '  "baseUrl": "http://localhost:1234/v1",',
      '  "model": "qwen3-14b"',
      '}',
      '```',
    ].join('\n');
    const score = scoreIterationEvalOutput('code-block', source, source);

    expect(extractFencedCodeBlocks(source)).toHaveLength(1);
    expect(score.pass).toBe(true);
  });

  it('scores uncertainty preservation with declarative checks', () => {
    const score = scoreDeterministicChecks(
      'This may reduce review time, but we need more examples before treating it as reliable.',
      [
        {
          name: 'uncertainty preserved',
          type: 'contains-any',
          values: ['may', 'might', 'not yet reliable'],
        },
        {
          name: 'not overclaimed',
          type: 'not-contains-any',
          values: ['definitely', 'proven'],
        },
      ],
    );

    expect(score.pass).toBe(true);
  });

  it('scores required term preservation', () => {
    const score = scoreDeterministicChecks(
      'Aram reviewed 42 submissions from the June 2026 workshop.',
      [
        {
          name: 'required terms preserved',
          type: 'contains-all',
          values: ['Aram', '42', 'June 2026'],
        },
      ],
    );

    expect(score.pass).toBe(true);
  });

  it('scores feedback and casual style checks', () => {
    const feedback = scoreDeterministicChecks(
      'The explanation is clear, but add one concrete example so the recommendation is easier to act on.',
      [
        {
          name: 'specific feedback',
          type: 'contains-any',
          values: ['example', 'recommendation', 'act on'],
        },
        {
          name: 'no vague praise',
          type: 'not-contains-any',
          values: ['great job', 'amazing work'],
        },
      ],
    );
    const casual = scoreDeterministicChecks(
      'The trade-off is simple: this saves time, but it makes mistakes harder to spot.',
      [
        {
          name: 'casual tradeoff',
          type: 'contains-any',
          values: ['trade-off', 'simple', 'but'],
        },
      ],
    );

    expect(feedback.pass).toBe(true);
    expect(casual.pass).toBe(true);
  });

  it('calculates iteration lift from baseline to final iteration', () => {
    const [summary] = calculateIterationLiftSummaries([
      {
        caseId: 'anti-generic',
        deterministicPass: false,
        elapsedMs: 10_000,
        finalStyleScore: 70,
        maxRewriteIterations: 0,
        meaningPass: true,
        ok: false,
      },
      {
        caseId: 'anti-generic',
        deterministicPass: true,
        elapsedMs: 15_000,
        finalStyleScore: 82,
        maxRewriteIterations: 2,
        meaningPass: true,
        ok: true,
      },
    ]);

    expect(summary).toMatchObject({
      caseId: 'anti-generic',
      helpful: true,
      latencyDeltaMs: 5_000,
      styleDelta: 12,
    });
  });

  it('splits iteration metrics by completion, style, meaning, deterministic, and overall pass', () => {
    const [summary] = calculateIterationMetricSummaries([
      {
        completed: true,
        deterministicPass: false,
        elapsedMs: 10_000,
        maxRewriteIterations: 0,
        meaningPass: true,
        ok: false,
        stylePass: true,
      },
      {
        completed: false,
        deterministicPass: false,
        elapsedMs: 20_000,
        maxRewriteIterations: 0,
        meaningPass: false,
        ok: false,
        stylePass: false,
      },
    ]);

    expect(summary).toMatchObject({
      completed: 1,
      completionRate: 0.5,
      deterministicPass: 0,
      meaningPass: 1,
      overallPass: 0,
      stylePass: 1,
      total: 2,
    });
  });
});
