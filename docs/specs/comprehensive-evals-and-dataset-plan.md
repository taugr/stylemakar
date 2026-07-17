# Comprehensive Evals And Dataset Plan

> Implementation status (2026-07-18): the v2 schema, taxonomy, family-isolated
> splits, frozen holdout checksum, validator, deterministic graders, expanded
> reliability suite, no-op/one-shot/full-pipeline runners, independent judge and
> judge report, blinded human review and agreement summary, confidence
> intervals, slice/baseline/regression reports, release thresholds, and CI tiers
> are implemented. The committed corpus contains 96 balanced pilot candidates:
> 34 direct-technical, 31 student-feedback, and 31 casual-explanatory cases; 79
> are hard/adversarial and 36 are structured or multi-paragraph. It meets pilot
> breadth quotas but remains `pilot-candidate-review`, not gold: every row still
> needs two independent human approvals, and the 40–60-case human study requires
> external reviewers. A same-source, three-profile slice is included to measure
> whether voice selection changes style without changing annotated facts.

## Summary

Replace the current narrow regression matrix with an evaluation system that can
answer two different questions:

1. does StyleMakar continue to pass known product requirements?
2. does the full iterative pipeline improve writing effectively across unseen
   inputs without changing meaning?

The existing harness remains valuable as a smoke and regression layer. It does
not yet provide strong efficacy evidence because the reported `36/36` result is
12 unique inputs repeated at rewrite-iteration limits `0`, `1`, and `2`.

The target is a versioned, reviewed dataset of 300–500 content cases, independent
grading, explicit one-shot and no-op baselines, a hidden holdout split, and a
small blinded human-preference study. Provider reliability remains a separate
mocked integration suite so infrastructure failures do not distort content
quality metrics.

The companion product roadmap is defined in
`docs/specs/high-impact-product-improvements-plan.md`. Dataset schema and baseline
work should start alongside provider-readiness implementation, and the current
pipeline baseline must be frozen before later phases change rewrite behavior.

## Current Limitations

### Narrow unique-input coverage

The current iteration matrix contains:

- 12 unique cases
- 4 direct-technical cases
- 4 student-feedback cases
- 4 casual-explanatory cases
- sentence and paragraph lengths only
- 11 total reference examples across the three profile fixtures

Running the same input at three iteration limits measures iteration behavior; it
does not create three independent efficacy examples.

### Tuning and evaluation are coupled

Several cases directly drove phrase rules, student-feedback policies, retry
behavior, and grader calibration. Passing those cases proves that known behavior
has not regressed, but it does not prove generalization to unseen examples.

### Some checks are shallow

Checks such as `contains-any` and `not-contains-any` are useful guardrails, but a
rewrite can include one expected keyword while still changing the broader
meaning. Conversely, a valid paraphrase may fail because it uses an unlisted
expression.

### Grading is not sufficiently independent

The pipeline's model-generated style and meaning checks are included in the
result being evaluated. Promptfoo rubric judging can also use the same local
model family. Self-assessment is diagnostic evidence, not an independent ground
truth.

### There is no efficacy baseline

The current result does not establish whether the iterative StyleMakar pipeline
is better than:

- leaving the source unchanged
- using one direct rewrite prompt
- using a simpler rewrite-plus-meaning-check pipeline
- a human edit

### There is no user-centered outcome

The harness does not yet measure human preference, acceptance, editing time, or
how much manual correction remains after a rewrite.

## Objectives

- Measure meaning fidelity and style improvement separately.
- Establish whether the iterative pipeline adds value over simpler baselines.
- Cover realistic content, structure, writing quality, and semantic hazards.
- Prevent tuning leakage through family-level splits and a hidden holdout.
- Combine deterministic checks, independent model judging, and human review.
- Report results by slice so a strong average cannot hide a dangerous failure
  family.
- Keep a fast developer loop while allowing comprehensive nightly and release
  evaluation.
- Preserve all raw artifacts needed to reproduce and adjudicate a result.

## Non-Goals

- Training or fine-tuning a model.
- Treating one exact rewrite as the only correct answer.
- Collecting private user documents without explicit opt-in and review.
- Replacing unit or provider-integration tests with model evals.
- Blocking every pull request on hundreds of slow local-model calls.
- Claiming universal writing quality from a single model or style family.

## Evaluation Architecture

Use three separate suites with separate reports.

### Suite A: Content Efficacy

Purpose: determine whether output preserves meaning and improves the requested
style.

Contains:

- 300–500 reviewed cases
- development, validation, and hidden holdout splits
- deterministic constraints
- independent semantic and style rubrics
- no-op, one-shot, and full-pipeline outputs
- repeated runs on release slices

### Suite B: Provider Reliability

Purpose: determine whether the product handles provider behavior correctly.

Contains mocked scenarios for:

- unreachable endpoint
- authentication failure
- `/models` unsupported or malformed
- selected model missing
- embedding-only model
- empty completion
- malformed JSON
- truncated response
- timeout and cancellation
- rate limit
- recovery after a transient failure

These are deterministic integration tests, not content dataset rows.

### Suite C: Human Preference And Editing Effort

Purpose: determine whether people prefer StyleMakar and need less work to use its
output.

Contains:

- 40–60 representative holdout cases
- blinded and randomized output ordering
- at least two reviewers per case
- comparison of no-op, one-shot, and full pipeline
- preference, acceptability, meaning-risk, and editing-effort judgments

## Dataset Layout

```text
evals/
  dataset-v2/
    README.md
    schema.json
    taxonomy.yaml
    manifest.json
    cases/
      meaning.jsonl
      style.jsonl
      formatting.jsonl
      difficult-inputs.jsonl
    splits/
      development.txt
      validation.txt
      holdout.txt
    rubrics/
      meaning.md
      style.md
      human-review.md
    reviews/
      README.md
  reliability/
    fixtures/
    mock-provider.ts
    scenarios.test.ts
  scripts/
    validate-dataset.ts
    build-splits.ts
    run-dataset.ts
    compare-baselines.ts
    build-eval-report.ts
```

Generated outputs remain under ignored `evals/results/` and must not be committed
as source dataset rows.

## Dataset Schema

Store cases as JSONL so each reviewed example is independently diffable.

```ts
type EvalSplit = 'development' | 'validation' | 'holdout';

type ContentEvalCase = {
  schemaVersion: 1;
  id: string;
  familyId: string;
  templateId?: string;
  split: EvalSplit;
  source: string;
  profile: {
    id: string;
    definitionPath?: string;
    inlineDefinition?: StyleProfile;
    referenceExamples: string[];
  };
  constraints: {
    mustPreserve: AtomicMeaningClaim[];
    mustPreserveVerbatim: string[];
    immutableBlocks: ImmutableBlock[];
    forbiddenClaims: string[];
    allowedTransformations: string[];
  };
  rubric: {
    meaning: string;
    style: string;
    minimumAcceptability: string;
  };
  referenceOutputs?: Array<{
    text: string;
    note: string;
  }>;
  metadata: {
    domain: ContentDomain;
    length: 'fragment' | 'sentence' | 'paragraph' | 'multi-paragraph';
    structure: string[];
    difficulty: 'basic' | 'medium' | 'hard' | 'adversarial';
    origin:
      'hand-authored' | 'synthetic-reviewed' | 'public-licensed' | 'opt-in';
    license: string;
    reviewedBy: string[];
    adjudicatedBy?: string;
  };
};

type AtomicMeaningClaim = {
  id: string;
  description: string;
  kind:
    | 'fact'
    | 'negation'
    | 'uncertainty'
    | 'causation'
    | 'condition'
    | 'recommendation-strength'
    | 'scope'
    | 'attribution'
    | 'sequence';
  requiredTerms?: string[];
};

type ImmutableBlock = {
  kind: 'code' | 'url' | 'identifier' | 'quote' | 'table-cell' | 'custom';
  value: string;
};
```

Reference outputs are optional because writing tasks allow many correct answers.
Constraints and rubrics are the primary annotations.

## Coverage Taxonomy

Construct cases as families. A family isolates one behavior, and its variants
change domain, length, wording, and difficulty without changing the capability
being tested.

### Meaning preservation families

- explicit negation
- uncertainty and confidence
- causation versus association
- conditional claims and exceptions
- recommendation strength
- temporal scope
- quantifiers and limits
- names, dates, numbers, percentages, currencies, and units
- attribution and responsibility
- ordered steps and dependencies
- multiple independent claims
- internally conflicting statements

### Style transformation families

- corporate marketing to direct technical
- over-formal to casual explanatory
- vague praise to actionable feedback
- overly warm feedback to fair, specific feedback
- verbose to concise
- choppy to coherent
- passive to appropriately direct
- jargon-heavy to accessible
- repetitive to tighter prose
- already on-style and should change minimally
- conflicting reference examples
- sparse or low-quality reference examples
- strong style without caricature or phrase imitation

### Structure and immutable-content families

- Markdown headings
- bullet and numbered lists
- tables
- fenced code blocks
- inline code
- URLs and email addresses
- blockquotes and quoted claims
- identifiers and version numbers
- mixed prose and structured content
- multi-paragraph documents

### Difficult-input families

- fragments
- spelling and punctuation errors
- very short inputs
- long paragraphs
- long documents
- non-Latin names and Unicode punctuation
- embedded prompt-like instructions
- quoted instructions that are content, not commands
- empty and whitespace-only input
- raw-data lines that should remain unchanged

### Content domains

Cover each major family across several domains:

- software and technical documentation
- product and project notes
- student and educational feedback
- email and workplace communication
- reports and analytical summaries
- announcements and public copy
- policies and procedures
- general explanations

## Dataset Size And Quotas

### Pilot gold set

Create 90–120 cases:

- at least 30 cases per existing profile
- at least 30 hard or adversarial cases
- at least 25 structured or multi-paragraph inputs
- every major meaning family represented

This set establishes the schema, review process, runners, and reporting format.

### Comprehensive v2 set

Expand to 360 reviewed cases:

- 120 direct-technical
- 120 student-feedback
- 120 casual-explanatory
- at least 80 multi-paragraph or structured cases
- at least 90 hard or adversarial cases
- no family contributes more than 10% of the set
- every domain appears in every profile where the combination is sensible

After the first 360 cases, add an unseen-profile slice that supplies inline
profile rules and examples not used by the built-in fixtures. This measures the
actual provider-agnostic voice mechanism rather than only three tuned profiles.

## Case Construction Workflow

### 1. Define the family

Write the exact capability, failure condition, and variant dimensions before
writing examples.

### 2. Hand-author canonical examples

Create two or three clear cases that isolate the behavior.

### 3. Create controlled variants

Vary domain, length, sentence structure, names, numbers, and writing quality.
Generated suggestions are acceptable at this stage, but they are candidate data,
not reviewed dataset rows.

### 4. Add counterfactual pairs

Create near-identical cases where one semantic feature changes:

```text
The pilot may reduce processing time.
The pilot reduces processing time.

The rollout was associated with higher acceptance.
The rollout caused higher acceptance.

Aram reviewed 42 submissions.
Aram did not review the 42 submissions.
```

Counterfactual pairs reveal systems that respond to topic words while ignoring
negation, certainty, or causal strength.

### 5. Annotate atomic meaning

List facts, caveats, conditions, attribution, and immutable text independently.
Do not let the model that proposed a case supply unreviewed ground truth.

### 6. Annotate style and acceptability

Describe the intended behavior rather than requiring exact wording. Add a
minimum-acceptability condition that can fail a fluent but unsafe rewrite.

### 7. Review independently

Reviewer A annotates the case. Reviewer B reviews without seeing A's rationale.
Disagreements are adjudicated and recorded.

### 8. Validate mechanically

Run schema, ID, split, license, duplicate, and coverage checks before committing
the case.

### 9. Freeze the family split

Assign all cases sharing a family or template to the same split before using
them for tuning.

### 10. Run baselines before product changes

Capture the no-op, one-shot, and current full-pipeline results so later work can
measure lift against a fixed starting point.

## Data Sources, Privacy, And Licensing

Preferred sources:

- project-owned hand-authored examples
- systematically generated synthetic examples that receive human review
- openly licensed public text with recorded source and license
- opt-in user examples that are redacted and approved for repository use

Do not add private correspondence, student work, customer text, credentials,
personal identifiers, or copied proprietary documents. Every row must record its
origin and license. Synthetic data should be labelled as synthetic-reviewed, not
presented as real user data.

## Split Policy

Use:

- 60% development
- 20% validation
- 20% hidden holdout

Split by `familyId` and `templateId`, never by randomly shuffling individual
paraphrases. A family used during prompt or policy development cannot also appear
in holdout.

Holdout rules:

- Holdout source rows and expected annotations must not be included in prompt
  development notes.
- Holdout results may be run for release decisions or scheduled efficacy reviews,
  not after every local prompt edit.
- A holdout case exposed during debugging is moved to validation and replaced by
  a new reviewed family.
- Split manifests are versioned and checksummed.

## Baseline Comparison

Generate these candidates for every validation and holdout case:

1. `no-op`: original source
2. `one-shot`: one direct rewrite request using the same profile and examples
3. `full-pipeline`: current iterative StyleMakar pipeline
4. `human-reference`: optional reviewed edit for the human-preference subset

Add a simpler `rewrite-plus-meaning-check` baseline if pipeline-cost analysis
shows that it would answer a meaningful product decision.

The primary efficacy question is not whether full-pipeline output can pass. It is
whether it improves style and human preference over the one-shot baseline
without increasing meaning errors beyond the agreed safety threshold.

## Grading Architecture

### Deterministic constraint grader

Use exact checks for:

- required verbatim terms
- numbers, units, dates, names, identifiers, and URLs
- immutable code and structured blocks
- forbidden phrases where the rule is genuinely lexical
- empty, truncated, or malformed output

Extend deterministic checks to normalize safe variations such as whitespace,
Unicode punctuation, and number formatting only when the annotation allows it.

### Independent semantic judge

Use a configurable judge provider that is not the generating model for the
release report. The judge receives atomic claims and forbidden changes rather
than a vague request to compare meaning.

Record:

- judge provider and model
- prompt/rubric version
- per-claim verdicts
- confidence or uncertainty
- raw response

The pipeline's internal meaning check remains a useful compared signal, but it
does not determine the external eval verdict by itself.

### Independent style judge

Judge behavior-level profile fit, not phrase matching. The judge sees the profile
rules, anti-rules, examples, source, and output. It must score both the source and
candidate so the report can measure style improvement, not only final style.

### Human adjudication

Sample:

- all deterministic-versus-judge disagreements
- all high-risk meaning failures
- a random slice of passes
- the human-preference study set

Human decisions become adjudication records, not silent edits to judge prompts.

## Metrics

### Reliability

- request completion rate
- valid structured-output rate
- empty and malformed response rate
- timeout and cancellation rate

### Meaning

- atomic-claim preservation rate
- concrete-detail preservation rate
- caveat and uncertainty preservation rate
- hallucinated-claim rate
- high-risk semantic failure rate

### Style

- final style score
- style improvement over source
- style improvement over one-shot baseline
- over-imitation rate
- no-op preference for already-on-style inputs

### Product efficacy

- blind preference win rate versus one-shot
- unacceptable-output rate
- mean and median editing time
- proportion accepted without editing
- reviewer agreement

### Operational

- median and percentile latency
- model calls per document and segment
- retry and repair frequency
- failure rate by provider, model, profile, family, structure, and difficulty

Report confidence intervals for aggregate and preference metrics. Always include
slice counts so small groups are not presented as precise estimates.

## Execution Tiers

### Pull-request smoke

- 20–30 fixed high-value cases
- deterministic mock-provider reliability suite
- one compatible local or mocked model path
- target runtime under five minutes where practical

Command:

```sh
pnpm eval:v2:smoke
```

### Nightly validation

- complete validation split
- no-op, one-shot, and full-pipeline comparison
- primary compatible model
- slice and regression report

Command:

```sh
pnpm eval:v2:validation
```

### Weekly or release efficacy

- validation and hidden holdout
- at least two compatible generator models where resources allow
- independent judge model
- three repeated runs for the stochastic release subset
- baseline comparison and confidence intervals

Command:

```sh
pnpm eval:v2:release
```

### Human review

- 40–60 holdout cases
- randomized and blinded candidate order
- at least two independent reviewers
- adjudication for meaning-risk disagreement

## Runner And Reporting Changes

### Dataset validator

Add `evals/scripts/validate-dataset.ts` to verify:

- schema version and required fields
- globally unique IDs
- valid profile references
- non-empty atomic claims for meaning-sensitive families
- recorded origin and license
- family/template split isolation
- exact duplicate and near-duplicate warnings
- taxonomy quota report
- holdout checksum

### Unified runner

Add `evals/scripts/run-dataset.ts` with filters for:

- split
- case ID and family
- profile
- domain
- difficulty
- structure
- generator provider and model
- baseline type
- repeat count

Reuse `/api/eval/rewrite` for the full pipeline while it remains the black-box
eval target. Add a one-shot target or runner adapter that uses the same provider,
profile, and examples without the iterative pipeline.

### Report builder

Add `evals/scripts/build-eval-report.ts` to produce:

- machine-readable JSON
- concise Markdown summary
- aggregate metrics with confidence intervals
- per-slice tables
- baseline lift
- worst-performing families
- new failures relative to a named baseline run
- links to raw ignored artifacts

Do not append unlimited raw run logs to `docs/reports/eval-findings.md`. Keep that
document concise and reference versioned result artifacts.

## Human Review Protocol

For each candidate set:

- randomize output order
- hide method, model, and iteration count
- ask which output best matches the profile
- ask which output best preserves meaning
- ask whether any output is unacceptable
- ask which output would be used with the least editing
- record estimated or observed editing time when reviewers edit the winner
- capture a short reason for meaning-risk or unacceptable judgments

Reviewers must be able to select `tie`, `none acceptable`, and `uncertain`.
Forced preference would overstate small stylistic differences.

## Implementation Phases

### Phase 0: Preserve The Existing Regression Layer

- Keep `evals/cases.yaml`, `evals/cases-smoke.yaml`, and the current 12-case
  matrix.
- Rename report labels so `36/36` is clearly described as 12 cases across three
  iteration settings.
- Mark these cases as development/regression cases, not holdout efficacy data.

Acceptance criteria:

- Existing commands continue to run.
- Reports stop describing repeated iteration rows as independent examples.

### Phase 1: Schema, Taxonomy, And Validation

- Add the dataset-v2 directories and schema.
- Add taxonomy and split manifests.
- Implement validator and unit tests.
- Convert current cases into development rows without deleting the old harness.

Acceptance criteria:

- All committed rows validate.
- Duplicate IDs and family leakage fail CI.
- Coverage counts are generated deterministically.

### Phase 2: Pilot Gold Dataset

- Build 90–120 independently reviewed cases.
- Cover every major meaning family.
- Add multi-paragraph, structured, and difficult-input cases.
- Record reviewer and adjudication metadata.

Acceptance criteria:

- Quotas in the pilot section are met.
- Every case has atomic constraints and licensing metadata.
- Validation and holdout families are not used for product tuning.

### Phase 3: Baselines And Independent Grading

- Add no-op, one-shot, and full-pipeline runners.
- Add independent semantic and style judge adapters.
- Add disagreement and adjudication artifacts.
- Build the first baseline-lift report.

Acceptance criteria:

- The report shows style lift and meaning failures for each method.
- Generator self-scores are not the sole external verdict.
- A run is reproducible from dataset, config, model, and rubric versions.

### Phase 4: Comprehensive Dataset

- Expand to 360 reviewed cases.
- Add unseen-profile cases.
- Add the full slice and confidence-interval report.
- Freeze the first efficacy holdout release.

Acceptance criteria:

- Comprehensive quotas are met.
- No family leakage exists across splits.
- Holdout manifest and checksum are recorded.
- Worst-performing slices are visible even when aggregate results are strong.

### Phase 5: Human Efficacy Study

- Select 40–60 representative holdout cases.
- Run blinded comparison with at least two reviewers.
- Measure preference, acceptability, meaning risk, and editing effort.
- Publish a concise findings report with limitations.

Acceptance criteria:

- Reviewer agreement and disagreement are reported.
- The report compares full pipeline against one-shot and no-op baselines.
- Claims about efficacy are limited to the tested profiles, content, models, and
  reviewers.

### Phase 6: Automation And Release Gates

- Add package commands and CI tiers.
- Keep pull-request smoke bounded.
- Schedule validation and release runs according to available local-model
  infrastructure.
- Require explicit review for holdout regressions and high-risk meaning failures.

Acceptance criteria:

- Smoke runs are practical for routine changes.
- Comprehensive runs produce durable, reproducible artifacts.
- Release notes include the tested generator and judge models.

## Initial Efficacy Thresholds

These are starting decision thresholds, not permanent scientific claims:

- completion rate at least 98% on compatible-provider content runs
- high-risk semantic failure below 1% on holdout
- concrete-detail preservation at least 99%
- full pipeline meaning performance no worse than one-shot
- statistically credible style-preference improvement over one-shot
- no profile, domain, or hard-difficulty slice hidden behind an aggregate result
- provider reliability scenarios pass deterministically

Thresholds should be revisited after the pilot establishes realistic variance
and reviewer agreement.

## Risks And Mitigations

### Synthetic-data bias

Mitigation: use controlled generation only for candidates, require human review,
track origin, and add licensed or opt-in real-world examples where safe.

### Evaluation overfitting

Mitigation: family-level splits, hidden holdout, family replacement after exposure,
and independent reviewers.

### Judge-model bias

Mitigation: use atomic constraints, a judge different from the generator, human
adjudication, and periodic judge agreement measurement.

### Cost and latency

Mitigation: tiered runs, focused filters, cached immutable baseline outputs, and
small repeated-run subsets rather than repeating every case on every commit.

### False precision

Mitigation: report sample counts, confidence intervals, disagreement, and slice
limitations rather than one headline pass percentage.

### Private or unlicensed text

Mitigation: require origin and license metadata, reject unapproved private data,
and validate repository fixtures during review.

## Required Repository Changes

- Add `evals/dataset-v2/` and its versioned data contract.
- Add validation, split, baseline, runner, judge, and report scripts.
- Add deterministic mock-provider reliability tests.
- Add package commands for smoke, validation, release, and dataset validation.
- Add unit tests for schema validation, split isolation, graders, and report math.
- Update `docs/reports/eval-findings.md` to distinguish regression results from
  efficacy evidence.
- Add a short contributor guide for authoring and reviewing cases.

## Definition Of Done

This plan is complete when StyleMakar has a reviewed and versioned comprehensive
dataset, isolated development/validation/holdout families, independent semantic
and style grading, no-op and one-shot baselines, slice-aware reports, deterministic
provider reliability tests, and a blinded human study capable of supporting a
carefully scoped answer to: `Does the full StyleMakar pipeline improve writing
without changing what the author means?`
