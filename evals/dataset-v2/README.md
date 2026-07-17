# Dataset v2

This directory is the source-of-truth content efficacy corpus. Rows are JSONL,
families never cross splits, and generated run artifacts belong in the ignored
`evals/results/` directory.

The corpus is deliberately labelled `pilot-candidate-review`. Its 96 rows meet
the planned pilot breadth quotas across profiles, difficulty, and structured
content, but candidate-authoring is not independent review. Rows become gold
only after two independent reviewers approve their annotations through the
append-only review record. Never tune against holdout annotations.

Run `pnpm eval:v2:validate` before committing dataset changes. See
`reviews/README.md` for the review protocol and `rubrics/` for external judge
contracts.

`pnpm eval:v2:case-review` builds the outstanding annotation review queue.
`pnpm eval:v2:validation` compares all three automated methods, while judge and
human commands remain explicit because they require independent models or
people.
