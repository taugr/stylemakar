# Initial Eval Spec for Style Rewriter

## Framework Choice

Use Promptfoo for the initial LLM eval framework.

Promptfoo should be used to evaluate the behaviour of the full Style Rewriter app, not just isolated model prompts.

The eval target should be:

```http
POST /api/eval/rewrite
```

This endpoint should run the same rewrite pipeline that a user would use in the application.

Use Vitest separately for deterministic app and pipeline tests.

---

## Why Promptfoo

Promptfoo is a good fit for this app because it supports:

- Running evals from configuration files.
- Calling HTTP endpoints.
- Running assertions against the final output.
- Using deterministic checks such as `contains` and `not-contains`.
- Using LLM-as-judge checks with `llm-rubric`.
- Using custom JavaScript assertions.
- Comparing outputs across prompts, providers, and models.
- Running evals locally and in CI.

The main benefit is that Promptfoo can test the actual rewrite pipeline as a black box.

The eval flow should be:

```text
eval case
  ↓
Promptfoo calls /api/eval/rewrite
  ↓
Style Rewriter runs full pipeline
  ↓
Promptfoo receives finalText
  ↓
Promptfoo runs assertions
  ↓
Promptfoo reports pass/fail and scores
```

---

## Split Between Promptfoo and Vitest

Use Promptfoo for output quality evals.

Use Vitest for normal app correctness tests.

### Promptfoo Should Test

- Meaning preservation.
- Caveat preservation.
- Style match.
- Anti-generic-AI rewriting.
- Over-imitation / parody.
- Formatting preservation from the user's perspective.
- Model/provider comparison.

### Vitest Should Test

- Document segmentation.
- Code block detection.
- Code block skipping.
- Markdown parser behaviour.
- SQLite persistence.
- Provider configuration validation.
- Max iteration limits.
- JSON schema validation.
- Retry behaviour.
- Meaning repair trigger logic.

Promptfoo should not replace unit and integration tests.

---

## Purpose of the Initial Eval Suite

The initial eval suite should test the highest-risk behaviours of the Style Rewriter app.

The goal is not to build a large benchmark at the start. The goal is to create a small set of high-value cases that catch the failures most likely to make the product feel untrustworthy.

The first evals should answer:

1. Does the rewrite preserve meaning?
2. Does it preserve important caveats and uncertainty?
3. Does it remove generic AI prose?
4. Does it match the selected style profile?
5. Does it avoid becoming a parody of the user's style?
6. Does it preserve formatting and protected content?

The eval target should be the full rewrite pipeline, not a single isolated prompt.

---

## Evaluation Philosophy

The app should be evaluated as a product, not just as an LLM call.

The test should run the same workflow that a real user experiences:

```text
source text
  ↓
selected style profile
  ↓
full rewrite pipeline
  ↓
final rewritten output
  ↓
eval assertions
```

The evals should test the final output produced by the app.

Do not only test isolated prompts unless debugging a specific pipeline stage.

---

## Recommended File Structure

```text
/evals
  promptfoo.yaml
  cases.yaml
  fixtures
    profiles
      direct-technical.json
      student-feedback.json
      casual-explanatory.json
    samples
      direct-technical-samples.json
      student-feedback-samples.json
      casual-explanatory-samples.json
  assertions
    preserve-code-blocks.js
    no-generic-ai.js
    preserve-required-terms.js
  scripts
    seed-eval-data.ts
```

---

## Eval Endpoint

Add an eval-specific endpoint to the app.

```http
POST /api/eval/rewrite
```

This endpoint should run the same rewrite pipeline as the normal app, but it should return additional debug information for eval analysis.

### Request

```ts
type EvalRewriteRequest = {
  source: string;
  styleProfileId: string;
  providerId?: string;
  model?: string;
  options?: {
    maxRewriteIterations?: number;
    runMeaningCheck?: boolean;
    runFinalSmoothing?: boolean;
  };
};
```

### Response

```ts
type EvalRewriteResponse = {
  finalText: string;
  debug: {
    provider: string;
    model: string;
    timings: {
      totalMs: number;
    };
    segments: Array<{
      index: number;
      type: string;
      originalText: string;
      finalText: string;
      attempts: Array<{
        rewrittenText: string;
        styleScore?: number;
        feedback?: string;
      }>;
      meaningCheck?: {
        pass: boolean;
        missingDetails: string[];
        addedClaims: string[];
        changedMeaning: string[];
      };
    }>;
  };
};
```

Promptfoo should evaluate `finalText`.

The `debug` field is included for diagnostics and failure analysis.

---

## Fixed Eval Fixtures

Eval runs should not depend on whatever data happens to exist in the local SQLite database.

Add fixed eval fixtures.

Add a seed script:

```bash
pnpm eval:seed
```

The seed script should insert or update the fixed eval style profiles in SQLite.

This gives the eval suite stable inputs.

---

## Initial Style Profiles

Use three fixed style profiles.

### 1. Direct Technical

Purpose:

Test concise, practical, non-corporate technical rewriting.

Profile traits:

- direct
- clear
- low enthusiasm
- practical
- avoids generic AI phrasing
- uses concrete explanations
- prefers plain words over inflated words

### 2. Student Feedback

Purpose:

Test rewriting into a constructive feedback style.

Profile traits:

- clear
- specific
- fair
- supportive but not overly warm
- gives concrete observations
- avoids vague praise
- avoids HR-style language

### 3. Casual Explanatory

Purpose:

Test a more informal explanatory style.

Profile traits:

- conversational
- practical
- uses examples
- explains trade-offs
- not too polished
- avoids corporate language

---

## Promptfoo Config

Create:

```text
/evals/promptfoo.yaml
```

Example:

```yaml
description: Style Rewriter MVP evals

providers:
  - id: http
    label: app-rewrite
    config:
      url: http://localhost:3000/api/eval/rewrite
      method: POST
      headers:
        content-type: application/json
      body:
        source: '{{source}}'
        styleProfileId: '{{styleProfileId}}'
        providerId: '{{providerId}}'
        model: '{{model}}'
        options:
          maxRewriteIterations: 2
          runMeaningCheck: true
          runFinalSmoothing: true
      transformResponse: 'json.finalText'

tests: file://cases.yaml
```

---

## Package Scripts

Add:

```json
{
  "scripts": {
    "eval:seed": "tsx evals/scripts/seed-eval-data.ts",
    "eval:rewrite": "promptfoo eval -c evals/promptfoo.yaml",
    "eval:view": "promptfoo view",
    "eval": "pnpm eval:seed && pnpm eval:rewrite"
  }
}
```

---

## Initial Eval Suites

Start with four suites:

1. Meaning preservation.
2. Anti-generic-AI rewriting.
3. Style profile sensitivity.
4. Formatting preservation.

These are the most valuable early evals because they catch the most serious product failures.

---

# Suite 1: Meaning Preservation

## Purpose

Meaning preservation is the most important eval category.

The app can tolerate imperfect style matching. It cannot tolerate changing the user's meaning.

These cases should catch:

- removed caveats
- changed certainty
- invented causation
- lost numbers
- lost dates
- altered recommendations
- softened or strengthened claims

---

## Case 1: Preserve Caveat About Causation

### Source

```text
The rollout increased acceptance rates, although causation has not yet been validated.
```

### Style Profile

```text
direct-technical
```

### Must Preserve

```text
- acceptance rates increased
- causation has not been validated
```

### Must Not Claim

```text
- the rollout caused the increase
```

### Assertions

```yaml
- type: llm-rubric
  metric: meaning_preservation
  threshold: 0.9
  value: |
    Does the rewritten text preserve the original meaning?

    It must preserve both:
    - acceptance rates increased
    - causation has not yet been validated

    Fail if the output implies that the rollout caused the increase.

- type: llm-rubric
  metric: caveat_preservation
  threshold: 0.9
  value: |
    Does the output preserve the caveat about causation not being validated?
```

---

## Case 2: Preserve Uncertainty

### Source

```text
This may reduce review time, but we need more examples before treating it as a reliable improvement.
```

### Style Profile

```text
direct-technical
```

### Must Preserve

```text
- the improvement is uncertain
- more examples are needed
- it should not yet be treated as reliable
```

### Must Not Claim

```text
- this definitely reduces review time
- the improvement is proven
```

### Assertions

```yaml
- type: llm-rubric
  metric: uncertainty_preservation
  threshold: 0.9
  value: |
    Does the output preserve the uncertainty in the original?

    The original says the change may reduce review time, but this is not yet reliable.
    Fail if the output makes the claim sound proven or definite.
```

---

## Case 3: Preserve Recommendation Strength

### Source

```text
We should probably keep the first version simple and avoid adding a vector database until there is a clear retrieval problem.
```

### Style Profile

```text
direct-technical
```

### Must Preserve

```text
- keep the first version simple
- avoid adding a vector database for now
- only add it if there is a clear retrieval problem
- recommendation is moderately confident, not absolute
```

### Must Not Claim

```text
- never use a vector database
- vector databases are bad
- a vector database is required
```

### Assertions

```yaml
- type: llm-rubric
  metric: recommendation_preservation
  threshold: 0.9
  value: |
    Does the output preserve the recommendation and its strength?

    The original recommends avoiding a vector database for now, unless there is a clear retrieval problem.
    Fail if the output makes this absolute, reverses the recommendation, or changes the reasoning.
```

---

## Case 4: Preserve Names, Dates, and Numbers

### Source

```text
The June 2026 pilot included 42 students across three workshops, with Aram reviewing the final submissions.
```

### Style Profile

```text
student-feedback
```

### Must Preserve

```text
- June 2026
- 42 students
- three workshops
- Aram
- final submissions
```

### Assertions

```yaml
- type: contains
  value: 'June 2026'
  metric: date_preserved

- type: contains
  value: '42'
  metric: number_preserved

- type: llm-rubric
  metric: entity_preservation
  threshold: 0.9
  value: |
    Does the output preserve the same date, number of students, number of workshops, person name, and review responsibility?
```

---

# Suite 2: Anti-Generic-AI Rewriting

## Purpose

A major goal of the app is to remove generic AI-sounding prose.

These cases should catch outputs that preserve or introduce phrases like:

- it is important to note
- robust and comprehensive
- leverage
- delve into
- seamless
- transformative
- in today's fast-paced world
- unlock the power of
- a testament to

---

## Case 5: Remove Corporate AI Phrasing

### Source

```text
It is important to note that this robust and comprehensive solution leverages modern AI capabilities to deliver a seamless user experience.
```

### Style Profile

```text
direct-technical
```

### Expected Behaviour

The rewrite should become plainer and more direct.

It should not preserve the inflated phrasing.

### Assertions

```yaml
- type: not-contains
  value: 'It is important to note'
  metric: removed_generic_phrase

- type: not-contains
  value: 'robust and comprehensive'
  metric: removed_inflated_phrase

- type: not-contains
  value: 'seamless user experience'
  metric: removed_marketing_phrase

- type: javascript
  value: file://assertions/no-generic-ai.js
  metric: no_generic_ai_phrases

- type: llm-rubric
  metric: directness
  threshold: 0.8
  value: |
    Does the output rewrite the source in clearer, more direct language?

    It should avoid corporate, marketing, or generic AI phrasing.
```

---

## Case 6: Avoid Generic Closing Sentence

### Source

```text
The tool rewrites each paragraph, grades the result, and retries when the style match is weak. This ensures a high-quality and polished final output that meets the user's needs.
```

### Style Profile

```text
direct-technical
```

### Expected Behaviour

The rewrite should preserve the pipeline description but remove the vague final sentence.

### Assertions

```yaml
- type: llm-rubric
  metric: anti_generic_ai
  threshold: 0.8
  value: |
    Does the output avoid generic AI-style closing language?

    The source contains a vague sentence about a high-quality polished final output.
    The rewrite should make this more specific or remove the empty phrasing.
```

---

# Suite 3: Style Profile Sensitivity

## Purpose

The same source text should produce meaningfully different outputs when rewritten with different style profiles.

This proves that style profiles actually affect behaviour.

The goal is not random variation. The goal is controlled stylistic difference.

---

## Case 7: Same Source, Direct Technical Style

### Source

```text
The current implementation works, but it mixes too many responsibilities into one function. It would be easier to test if the parsing, rewriting, and grading logic were separated.
```

### Style Profile

```text
direct-technical
```

### Expected Behaviour

The output should be concise, direct, and practical.

### Assertions

```yaml
- type: llm-rubric
  metric: direct_technical_style
  threshold: 0.8
  value: |
    Does the output match a direct technical writing style?

    Reward:
    - clear recommendation
    - practical language
    - concise explanation
    - low generic polish

    Do not reward:
    - excessive warmth
    - vague encouragement
    - corporate phrasing
```

---

## Case 8: Same Source, Student Feedback Style

### Source

```text
The current implementation works, but it mixes too many responsibilities into one function. It would be easier to test if the parsing, rewriting, and grading logic were separated.
```

### Style Profile

```text
student-feedback
```

### Expected Behaviour

The output should sound like specific, constructive feedback.

It should not become vague praise.

### Assertions

```yaml
- type: llm-rubric
  metric: student_feedback_style
  threshold: 0.8
  value: |
    Does the output match a constructive student feedback style?

    Reward:
    - specific observation
    - clear explanation
    - constructive recommendation
    - fair tone

    Do not reward:
    - vague praise
    - excessive warmth
    - generic encouragement
```

---

## Case 9: Avoid Over-Imitation

### Source

```text
The interface has too many controls visible at once. The primary task is just rewriting text, so the design should make that feel obvious.
```

### Style Profile

```text
casual-explanatory
```

### Expected Behaviour

The output should sound natural and style-aligned, but not exaggerated or quirky.

### Assertions

```yaml
- type: llm-rubric
  metric: no_parody
  threshold: 0.8
  value: |
    Does the output avoid exaggerated imitation?

    The rewrite should sound natural and plausibly human.
    Fail if it feels like a caricature of the style profile, overuses pet phrases, or copies superficial quirks.
```

---

# Suite 4: Formatting Preservation

## Purpose

The app must preserve protected formatting and content.

These checks should be mostly deterministic.

---

## Case 10: Preserve Markdown Headings and Bullets

### Source

```markdown
# Rewrite Plan

The system should process the document in stages.

- Segment the document
- Rewrite each paragraph
- Check meaning preservation
- Assemble the final output
```

### Style Profile

```text
direct-technical
```

### Expected Behaviour

The heading and bullet structure should remain intact.

### Assertions

```yaml
- type: contains
  value: '#'
  metric: heading_preserved

- type: contains
  value: '-'
  metric: bullets_preserved

- type: llm-rubric
  metric: markdown_structure
  threshold: 0.9
  value: |
    Does the output preserve the markdown heading and bullet list structure?
```

---

## Case 11: Preserve Code Blocks

### Source

The source for this case should contain prose and a JSON code block.

The prose may be rewritten.

The JSON code block must remain unchanged.

### Source Text

````markdown
The provider config should use an OpenAI-compatible endpoint.

```json
{
  "baseUrl": "http://localhost:1234/v1",
  "model": "qwen3-14b"
}
```

The surrounding explanation can be rewritten, but the JSON block should not change.
````

### Style Profile

```text
direct-technical
```

### Expected Behaviour

The prose may be rewritten.

The JSON code block must remain unchanged.

### Assertions

```yaml
- type: javascript
  value: file://assertions/preserve-code-blocks.js
  metric: code_blocks_preserved

- type: contains
  value: 'http://localhost:1234/v1'
  metric: endpoint_preserved

- type: contains
  value: 'qwen3-14b'
  metric: model_name_preserved
```

---

## Custom Assertion: Preserve Code Blocks

Create:

```text
/evals/assertions/preserve-code-blocks.js
```

Implementation idea:

````js
function extractCodeBlocks(text) {
  const regex = /```[\s\S]*?```/g;
  return text.match(regex) || [];
}

module.exports = function preserveCodeBlocks(output, context) {
  const input = context.vars.source;

  const inputBlocks = extractCodeBlocks(input);
  const outputBlocks = extractCodeBlocks(output);

  const pass =
    inputBlocks.length === outputBlocks.length &&
    inputBlocks.every((block, index) => block === outputBlocks[index]);

  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass
      ? 'Code blocks were preserved.'
      : 'Code blocks changed or were not preserved.',
  };
};
````

---

## Custom Assertion: No Generic AI Phrases

Create:

```text
/evals/assertions/no-generic-ai.js
```

Implementation idea:

```js
const bannedPhrases = [
  'it is important to note',
  'robust and comprehensive',
  'delve into',
  'leverage',
  'seamless user experience',
  'in conclusion',
  "in today's fast-paced world",
  'unlock the power of',
  'a testament to',
];

module.exports = function noGenericAi(output) {
  const lower = output.toLowerCase();

  const matches = bannedPhrases.filter((phrase) => lower.includes(phrase));

  return {
    pass: matches.length === 0,
    score: matches.length === 0 ? 1 : 0,
    reason:
      matches.length === 0
        ? 'No banned generic AI phrases found.'
        : `Found banned phrases: ${matches.join(', ')}`,
  };
};
```

---

## Custom Assertion: Preserve Required Terms

Create:

```text
/evals/assertions/preserve-required-terms.js
```

This can be used when an eval case defines a list of required terms.

Example case variables:

```yaml
vars:
  requiredTerms:
    - 'June 2026'
    - '42'
    - 'Aram'
```

Implementation idea:

```js
module.exports = function preserveRequiredTerms(output, context) {
  const requiredTerms = context.vars.requiredTerms || [];

  const missing = requiredTerms.filter((term) => !output.includes(term));

  return {
    pass: missing.length === 0,
    score: missing.length === 0 ? 1 : 0,
    reason:
      missing.length === 0
        ? 'All required terms were preserved.'
        : `Missing required terms: ${missing.join(', ')}`,
  };
};
```

---

## Recommended Initial Case Count

Start with 11 cases total.

Breakdown:

```text
Meaning preservation: 4
Anti-generic-AI: 2
Style profile sensitivity: 3
Formatting preservation: 2
```

This is small enough to maintain but large enough to catch meaningful regressions.

---

## Pass Criteria

For the first MVP eval suite, use these thresholds:

```text
Meaning preservation: 90%+
Caveat preservation: 90%+
Style match: 80%+
Anti-generic-AI: 80%+
Formatting preservation: 95%+
Code block preservation: 100%
```

Hard failures:

- changed meaning
- invented factual claim
- removed important caveat
- changed code block
- lost critical number, date, or name

Soft failures:

- slightly weak style match
- mildly generic wording
- awkward phrasing
- slight over-polishing

Meaning failures should block release.

Style failures should guide prompt and model iteration.

---

## First Implementation Order

Implement in this order:

1. Add `/api/eval/rewrite`.
2. Add fixed eval style profiles.
3. Add `pnpm eval:seed`.
4. Add Promptfoo config.
5. Add the 11 initial eval cases.
6. Add custom JavaScript assertions.
7. Run against one local model.
8. Run against one hosted model.
9. Compare failures.
10. Use failures to improve rewrite prompts.

---

## Principle

The first eval suite should stay small and sharp.

Do not try to test everything.

Focus on the failures that would immediately break user trust:

- meaning changed
- caveat removed
- output sounds generic
- style profile has no effect
- protected formatting is damaged
