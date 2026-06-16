# Student-Feedback Meaning Policy Spec

## Summary

Add a student-feedback-specific meaning policy so the rewrite pipeline can distinguish valid feedback transformations from semantic drift. The current generic meaning checker is too strict for vague praise: it can treat removed warmth or praise words as missing meaning, even when the rewrite correctly turns vague praise into actionable feedback guidance.

This task should preserve the existing generic meaning checker for other style profiles and add profile-aware handling for `student-feedback`.

## Problem

The latest evals show that direct technical and casual explanatory rewrites are passing the current matrix, while the remaining weakness is student-feedback meaning calibration.

Example source:

```text
I am so proud of this incredible work, and you should feel amazing about how wonderful your answer is.
```

Latest reasonable rewrite:

```text
This feedback is too general to be useful for revision. Replace the broad praise with one specific part of your answer and explain why that specific section works.
```

The rewrite passes deterministic style checks, but the generic meaning checker can still fail it because the rewrite intentionally removes warmth and changes vague praise into revision guidance.

## Desired Behavior

For the `student-feedback` profile, meaning checks should:

- Preserve concrete details: names, dates, numbers, explicit responsibilities, referenced submissions, workshops, counts, and caveats.
- Allow vague praise to become actionable feedback guidance.
- Allow general next-step framing such as asking the student to add, explain, revise, identify, or point to a specific part of the work.
- Fail invented facts about the submitted work, such as unsupported sections, formulas, data visualizations, projects, technical details, structural elements, or performance claims.
- Fail changed concrete facts.
- Not require preserving praise intensity, warmth, encouragement, or vague quality claims.

## Implementation Changes

- Add a shared student-feedback meaning helper near the existing `src/shared/studentFeedback.ts` logic.
- Activate it only when the style profile is student-feedback-like, using the existing profile detection behavior.
- Apply it after the model meaning check normalizes its result, before meaning repair is triggered.
- The helper should transform the meaning-check result by:
  - removing missing details that are only vague praise or warmth from the source
  - removing added claims that are allowed feedback framing
  - preserving failures for concrete missing details, invented work-specific facts, and changed concrete meaning
- Keep the generic `checkMeaning` prompt as the fallback for all non-student-feedback profiles.
- Avoid adding more broad phrase-rule tuning unless needed to encode one of the policy categories above.

## Acceptance Criteria

- The known vague-praise case should pass meaning when rewritten into actionable feedback guidance.
- Student-feedback cases with concrete details must still fail if names, numbers, dates, or responsibilities are removed or changed.
- Student-feedback rewrites must still fail if they invent unsupported work-specific facts.
- Direct technical and casual explanatory eval behavior should not change.
- The existing anti-generic gate must keep working.

## Test Plan

- Add unit tests for the student-feedback meaning helper:
  - removes vague praise from `missingDetails`
  - allows added guidance like `add one example` or `explain why it works`
  - keeps missing concrete details such as `Aram`, `42`, or `June 2026`
  - keeps invented submitted-work claims as failures
- Add pipeline tests for:
  - vague praise rewritten as actionable feedback without triggering repair
  - concrete student-feedback details still being preserved
  - unsupported invented details still causing failure or retry feedback
- Run:
  - `pnpm test`
  - `pnpm typecheck`
  - `pnpm lint`
  - `pnpm format`

## Live Verification

Use the QAT model path:

```sh
STYLEMAKAR_EVAL_MODEL=google/gemma-4-12b-qat STYLEMAKAR_EVAL_REASONING_EFFORT=none STYLEMAKAR_EVAL_CASE_FILTER=feedback-sentence-overwarm pnpm eval:iterations:matrix
```

Expected result:

- The `feedback-sentence-overwarm` case passes meaning and deterministic checks.
- If that passes, rerun the student-feedback slice:

```sh
STYLEMAKAR_EVAL_MODEL=google/gemma-4-12b-qat STYLEMAKAR_EVAL_REASONING_EFFORT=none STYLEMAKAR_EVAL_CASE_FILTER=student-feedback pnpm eval:iterations:matrix
```

Target:

- Student-feedback slice improves beyond the previous `10/12` pass result.
- Any remaining failures are documented in `docs/reports/eval-findings.md`.

## Assumptions

- The current phrase gates are sufficient for the next pass; the main issue is semantic policy, not more wording bans.
- Student-feedback is allowed to change the speech act from vague praise to actionable revision guidance.
- Meaning preservation for concrete facts remains stricter than style.
