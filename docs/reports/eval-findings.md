# Eval Findings

## Summary

The eval harness now exercises the real rewrite pipeline through `POST /api/eval/rewrite`, and the current best local model path is LM Studio with `google/gemma-4-12b-qat` and `reasoningEffort: none`.

The main product-quality picture has changed since the first runs:

- Early failures were dominated by local model reliability: empty completions, invalid JSON, and slow full-pipeline calls.
- QAT/no-reasoning runs are reliable enough for targeted evals.
- Runtime deterministic gates now prevent obvious anti-generic and student-feedback failures from being accepted solely because the model grader gave a high style score.
- The remaining weakness is student-feedback meaning calibration for very vague praise.

Raw JSON artifacts are written under ignored `evals/results/`. The most relevant latest artifacts are:

- `evals/results/iteration-lift-2026-06-10T13-30-40-605Z.json`
- `evals/results/iteration-matrix-2026-06-10T13-53-52-210Z.json`
- `evals/results/iteration-matrix-2026-06-10T17-27-03-879Z.json`
- `evals/results/iteration-matrix-2026-06-10T17-52-49-070Z.json`

## What Changed

- Added focused iteration evals comparing `maxRewriteIterations` values `0`, `1`, and `2`.
- Added a 12-case sentence/paragraph matrix covering `direct-technical`, `student-feedback`, and `casual-explanatory`.
- Split metrics into completion, style conformance, meaning, deterministic checks, and overall pass.
- Added `reasoningEffort` pass-through so LM Studio can be run with `reasoning_effort: none`.
- Added runtime anti-generic gating for direct/technical writing.
- Added runtime student-feedback gating for unsupported details and vague praise.
- Added deterministic feedback into the retry loop so model grader success is not enough when simple checks fail.
- Constrained meaning repair so it does not reintroduce banned generic phrasing or vague praise.

## Current Results

### Focused Iteration Eval

Latest focused run with `google/gemma-4-12b-qat` and `reasoningEffort: none`:

| Case                          | Iteration Limits | Result |
| ----------------------------- | ---------------- | ------ |
| Anti-generic rewriting        | 0, 1, 2          | pass   |
| Causation caveat preservation | 0, 1, 2          | pass   |
| Code block preservation       | 0, 1, 2          | pass   |

The focused eval passed `9/9` runs.

### Full Matrix

Latest full 12-case matrix before student-feedback tuning:

| Style              | Overall Result |
| ------------------ | -------------- |
| direct-technical   | 12/12 pass     |
| casual-explanatory | 12/12 pass     |
| student-feedback   | 3/12 pass      |

Completion was `12/12` at every iteration level. The reliability issue from the first evals is no longer the dominant problem.

### Student-Feedback Tuning

After adding the student-feedback gate and updated profile examples, the student-feedback slice improved from `3/12` to `10/12` in the filtered matrix run.

The remaining hard case is:

```text
I am so proud of this incredible work, and you should feel amazing about how wonderful your answer is.
```

Latest output:

```text
This feedback is too general to be useful for revision. Replace the broad praise with one specific part of your answer and explain why that specific section works.
```

This output passes deterministic style checks but still fails the model meaning checker. That looks like a grader calibration issue: the rewrite intentionally converts vague praise into actionable feedback guidance.

## Interpretation

The app is now substantially more credible for the target rewrite behavior:

- Direct technical rewrites are passing the current matrix.
- Casual explanatory rewrites are passing the current matrix.
- Anti-generic failures are handled by deterministic runtime gates.
- Protected code block behavior passed the focused eval.
- Iteration is useful when deterministic gates force retries, but many QAT outputs pass on the first attempt.

The remaining gap is not general rewrite quality. It is the semantic judge for vague student praise. The current generic meaning checker treats some intended feedback transformations as meaning drift.

## Recommended Next Step

Do not keep adding phrase rules for the remaining student-feedback case. The better next change is a student-feedback-specific meaning policy:

- preserve concrete details: names, dates, numbers, explicit responsibilities
- allow converting vague praise into actionable revision guidance
- fail invented facts about the submitted work
- fail changed concrete facts
- do not require preserving warmth or praise words

That should replace generic semantic checking for the student-feedback profile, or at least post-process its meaning-check result in a more principled way.
