# Review records

Reviewer A annotates claims and constraints. Reviewer B reviews the source and
annotations without A's rationale. Store disagreements and adjudication as
append-only JSONL keyed by case ID. A model may suggest candidates, but it
cannot be recorded as an independent human reviewer. Opt-in or licensed source
text must include provenance and redaction approval.

Run `pnpm eval:v2:case-review` to create a queue containing every row with fewer
than two independent approvals. Record completed decisions in
`case-reviews.jsonl` with `caseId`, a stable non-identifying `reviewerId`,
`decision` (`approve` or `changes-requested`), `reviewedAt`, and a concise
`disagreement` note. The validator rejects unknown cases and duplicate decisions
from the same reviewer. Candidate-authoring metadata does not count as an
independent approval.
