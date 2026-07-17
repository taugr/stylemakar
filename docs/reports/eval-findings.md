# Eval Findings

## Summary

The original regression harness exercises the real rewrite pipeline through `POST /api/eval/rewrite`. Its `36/36` result represents **12 unique development cases repeated at three rewrite-iteration limits**, not 36 independent efficacy examples.

Dataset v2 now adds 96 family-isolated development, validation, and holdout candidates; atomic meaning constraints; immutable blocks; licensing and review metadata; deterministic validation; no-op, one-shot, and full-pipeline runners; slice-aware confidence-interval and regression reports; an independent-judge adapter; and blinded human-review and agreement tooling. The committed v2 corpus is labelled `pilot-candidate-review`: it meets pilot breadth quotas, but 0/96 rows currently have two independent approvals, so it must not yet be cited as efficacy evidence.

The main product-quality picture has changed since the first runs:

- Early failures were dominated by local model reliability: empty completions, invalid JSON, and slow full-pipeline calls.
- QAT/no-reasoning runs are reliable enough for targeted evals.
- Runtime deterministic gates now prevent obvious anti-generic and student-feedback failures from being accepted solely because the model grader gave a high style score.
- Student-feedback vague-praise meaning calibration is now handled by a profile-aware policy.

Raw JSON artifacts are written under ignored `evals/results/`. The most relevant latest artifacts are:

- `evals/results/iteration-lift-2026-06-10T13-30-40-605Z.json`
- `evals/results/iteration-matrix-2026-06-10T13-53-52-210Z.json`
- `evals/results/iteration-matrix-2026-06-10T17-27-03-879Z.json`
- `evals/results/iteration-matrix-2026-06-10T17-52-49-070Z.json`
- `evals/results/iteration-matrix-2026-06-16T02-57-50-762Z.json`
- `evals/results/iteration-matrix-2026-06-16T03-25-06-924Z.json`
- `evals/results/iteration-matrix-2026-06-16T03-50-33-170Z.json`

## What Changed

- Added focused iteration evals comparing `maxRewriteIterations` values `0`, `1`, and `2`.
- Added a 12-case sentence/paragraph matrix covering `direct-technical`, `student-feedback`, and `casual-explanatory`.
- Split metrics into completion, style conformance, meaning, deterministic checks, and overall pass.
- Added `reasoningEffort` pass-through so LM Studio can be run with `reasoning_effort: none`.
- Added runtime anti-generic gating for direct/technical writing.
- Added runtime student-feedback gating for unsupported details and vague praise.
- Added deterministic feedback into the retry loop so model grader success is not enough when simple checks fail.
- Constrained meaning repair so it does not reintroduce banned generic phrasing or vague praise.
- Added a student-feedback-specific meaning policy that allows vague praise to become actionable feedback guidance while preserving concrete facts.
- Added a student-feedback retry safeguard so a meaning-safe draft is not replaced solely to chase a marginal style score.
- Tightened the casual-explanatory eval profile so technical concepts include a practical explanation cue.

## Current Results

### Focused Iteration Eval

Latest focused run with `google/gemma-4-12b-qat` and `reasoningEffort: none`:

| Case                          | Iteration Limits | Result |
| ----------------------------- | ---------------- | ------ |
| Anti-generic rewriting        | 0, 1, 2          | pass   |
| Causation caveat preservation | 0, 1, 2          | pass   |
| Code block preservation       | 0, 1, 2          | pass   |

The focused eval passed `9/9` runs.

### Historical Full Matrix

Latest full 12-case matrix before student-feedback tuning:

| Style              | Overall Result |
| ------------------ | -------------- |
| direct-technical   | 12/12 pass     |
| casual-explanatory | 12/12 pass     |
| student-feedback   | 3/12 pass      |

Completion was `12/12` at every iteration level. The reliability issue from the first evals is no longer the dominant problem.

### Student-Feedback Tuning

After adding the student-feedback gate and updated profile examples, the student-feedback slice improved from `3/12` to `10/12` in the filtered matrix run.

The remaining hard case was:

```text
I am so proud of this incredible work, and you should feel amazing about how wonderful your answer is.
```

The student-feedback meaning policy now allows this kind of vague praise to become actionable guidance without treating removed warmth as missing meaning.

## 2026-06-16 Policy Verification

Implemented the student-feedback meaning policy and reran the matrix with `STYLEMAKAR_EVAL_MODEL=google/gemma-4-12b-qat` and `STYLEMAKAR_EVAL_REASONING_EFFORT=none`.

Key artifacts:

- `evals/results/iteration-matrix-2026-06-16T02-57-50-762Z.json`: student-feedback slice after the meaning policy and retry safeguard.
- `evals/results/iteration-matrix-2026-06-16T03-25-06-924Z.json`: focused casual technical-concept rerun after fixture tuning.
- `evals/results/iteration-matrix-2026-06-16T03-50-33-170Z.json`: final full matrix.

Final full matrix result:

| Iteration Limit | Overall Pass | Meaning | Deterministic | Completion |
| --------------: | -----------: | ------: | ------------: | ---------: |
|               0 | 12/12 (100%) |   12/12 |         12/12 |      12/12 |
|               1 | 12/12 (100%) |   12/12 |         12/12 |      12/12 |
|               2 | 12/12 (100%) |   12/12 |         12/12 |      12/12 |

Notes:

- The known overwarm student-feedback case now passes meaning and deterministic checks.
- The student-feedback slice passes all 12 result rows.
- The final full matrix passes all 36 result rows.
- These are 12 unique inputs across three iteration settings. They remain regression data, not a hidden holdout.
- `Feedback paragraph: submission specifics` still receives a low model style-conformance score (`78`) while passing meaning, deterministic checks, and overall eval result. The retry safeguard keeps that meaning-safe draft instead of chasing a style retry that previously introduced semantic drift.
