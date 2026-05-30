# Eval Findings

Date: 2026-05-30

## Summary

The eval harness is implemented, but the current full eval run is too slow for a useful local feedback loop.

`pnpm eval` starts correctly, seeds the fixed eval fixtures, and reaches Promptfoo execution. The run had to be stopped after more than seven minutes without completing the 11-case MVP suite.

## What Was Verified

- `pnpm eval:seed` validates and materializes the three fixed eval style profiles.
- `POST /api/eval/rewrite` runs the same rewrite pipeline as the app and returns `finalText` plus segment debug data.
- LM Studio was reachable at `http://localhost:1234/v1`.
- The selected model was `google/gemma-4-e4b`.
- A single direct eval endpoint call completed successfully in about 25.7 seconds.

Example direct endpoint result:

```json
{
  "ok": true,
  "status": 200,
  "elapsedMs": 25748,
  "finalText": "Acceptance rates increased following the rollout; however, causation remains unvalidated."
}
```

## Performance Finding

The full Promptfoo suite currently runs each case through the full rewrite pipeline and also runs LLM rubric assertions. With the measured single-case endpoint latency of about 25.7 seconds before rubric grading, the 11-case suite is expected to take several minutes at minimum. In practice, the Promptfoo run exceeded seven minutes without completing.

This is not a correctness failure in the endpoint or fixtures. It is a throughput issue in the current local eval workflow.

## Harness Issues Found And Fixed

- Promptfoo needed filesystem access to create its global cache under `~/.promptfoo`.
- The default Promptfoo concurrency of 4 overloaded the local full-pipeline eval path, so eval concurrency was capped at 1.
- JavaScript assertions received raw provider responses in this Promptfoo version, so custom assertions now normalize object responses to `finalText`.
- The required-terms assertion now accepts either array or delimited-string fixture values.

## Follow-Up Recommendations

- Add a fast eval mode that disables final smoothing and/or meaning repair for quick local smoke runs.
- Add per-case timeout reporting so slow cases are visible instead of appearing hung.
- Consider a smaller smoke subset for pre-commit checks and keep the full Promptfoo suite for deliberate model-quality runs.
- Add explicit timing metrics to Promptfoo output or export debug timings from `POST /api/eval/rewrite` into a report artifact.

## Smoke Eval Results

Date: 2026-05-31

A 4-case smoke suite was added and run with:

- `maxRewriteIterations: 0`
- `runMeaningCheck: true`
- `runFinalSmoothing: false`
- deterministic assertions only

The run completed in 4m35s. Promptfoo reported 1 passed assertion-level row and 6 failed assertion-level rows.

### Case Results

1. Causation caveat preservation passed.

   Output:

   ```text
   Acceptance rates increased following the rollout; however, causation remains unvalidated.
   ```

   This preserved the caveat that causation was not validated.

2. Required entity preservation did not complete successfully.

   Direct endpoint check:

   ```json
   {
     "status": 502,
     "elapsedMs": 55413,
     "error": "LM Studio returned an empty completion."
   }
   ```

   This is a reliability failure in the model/pipeline path.

3. Anti-generic rewriting failed.

   Output:

   ```text
   This robust, comprehensive solution uses modern AI capabilities to provide a seamless user experience.
   ```

   The output removed "It is important to note" and changed "leverages" to "uses", but it kept the inflated phrases "robust, comprehensive" and "seamless user experience". The pipeline debug style score was 70, so the grader recognized the issue, but the smoke configuration used `maxRewriteIterations: 0` and did not retry.

4. Code block preservation did not complete successfully.

   Direct endpoint check:

   ```json
   {
     "status": 502,
     "elapsedMs": 29427,
     "error": "Model response did not include a JSON object."
   }
   ```

   This is another reliability failure in the model/pipeline path. The code block case is especially important because protected content should be stable.

### Smoke Findings

- The app can preserve a simple causation caveat in at least one high-risk meaning case.
- The app is not yet reliable across the smoke set; two cases failed before producing final text.
- Anti-generic rewriting is too weak in the tested configuration. The model made the sentence somewhat plainer but preserved the main marketing phrases.
- The internal style grader can identify weak style output, but the smoke path with zero retries does not act on that feedback.

### Recommended Next Actions

- Fix pipeline reliability before broadening eval coverage: empty completions and non-JSON model responses should be retried or repaired more gracefully.
- Keep code-block cases in the smoke suite because they currently expose reliability risk.
- For anti-generic rewriting, either strengthen the rewrite prompt or allow one retry in smoke evals so low style scores can trigger the existing revision path.
- Make Promptfoo smoke output easier to interpret by avoiding fixture shapes that expand one case into multiple table rows.
