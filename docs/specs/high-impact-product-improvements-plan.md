# High-Impact Product Improvements Plan

> Implementation status (2026-07-18): the core roadmap is implemented across
> provider capability checks, local/remote disclosure, user-managed voices,
> immutable voice snapshots, streamed cancellable/stale-safe runs, editable and
> accepted rewrite versions, visible quality warnings, versioned browser and
> atomic Tauri app-data storage, recoverable deletion, backups, deterministic
> browser journeys, provider reliability tests, and accessibility smoke gates.
> Authenticated remote-provider secret storage remains deliberately deferred;
> no secret is currently accepted or written to browser storage.

## Summary

Move StyleMakar from a visually polished prototype to a dependable local-first
writing tool. The core rewrite pipeline can produce useful, meaning-preserving
output with a compatible model, but the surrounding product still makes claims
that are stronger than the behavior it has verified.

The highest-impact work is:

1. make provider and model readiness trustworthy
2. implement the voice and reference-example workflow promised by the UI
3. make long-running rewrites observable, cancellable, and more efficient
4. turn output into a reviewable and editable revision workflow
5. make local documents durable and manageable
6. add end-to-end, native, and accessibility quality gates

This plan preserves the current product direction:

- local-first desktop app
- user-configurable OpenAI-compatible providers
- LM Studio as a preset, not a hard dependency
- meaning preservation takes priority over style conformance
- browser/Express mode remains available for development and evals
- Tauri remains the primary packaged-app runtime

The companion evaluation work is defined in
`docs/specs/comprehensive-evals-and-dataset-plan.md`.

## Current Evidence

The July 2026 product audit found:

- `GET /models` succeeded and the UI reported `Provider ready`.
- The automatic model selection chose `google/gemma-4-e4b` because it was the
  first matching Gemma 4 model.
- The first rewrite then failed because the model response did not contain the
  required JSON object.
- Switching to `google/gemma-4-12b-qat` with no reasoning produced a useful
  rewrite that preserved the test date and numeric constraint.
- The successful rewrite took tens of seconds while the UI displayed only
  `Rewriting...`.
- The voice picker contains one profile, the desktop and mobile add-example
  controls do not add examples, and rewrites still use bundled defaults.
- The version selector contains only `Version 1`, output is read-only, stored
  warnings are not presented, and advanced results are exposed as raw JSON.
- Documents are persisted as unvalidated `localStorage` JSON, with no delete,
  duplicate, search, backup, or data migration flow.
- Unit, API, type, lint, format, build, desktop, Cargo, and docs checks pass, but
  there is no automated end-to-end writing journey or native Rust test suite.

The conclusion is not that the rewrite pipeline needs to be replaced. It needs
a reliable product boundary, honest state communication, and a complete editing
workflow around it.

## Product Principles

### Readiness must describe the capability being tested

Reachability, model discovery, structured-output compatibility, and successful
rewriting are different states. The UI must not collapse them into a single
green status.

### User-facing quality evidence must come from the current run

Do not show `Meaning preserved`, a style score, or a successful state unless the
specific rewrite produced the supporting result. A disabled check should be
reported as `Not checked`, not as a pass.

### Local-first does not mean provider-blind

Local providers should be the easiest path, but users should be able to
configure any compatible endpoint. The app must clearly distinguish local and
remote providers and must not persist secrets in browser storage.

### Preserve the existing dual runtime

New capabilities should be implemented behind client adapters so browser/Express
development and Tauri use the same product contracts without duplicating UI
logic.

### Optimize only after behavior is measurable

Caching, concurrency, structured-output features, and prompt reductions must be
evaluated against the expanded eval plan before becoming defaults.

## Priority And Sequencing

| Priority | Workstream                   | Product outcome                                                        | Depends on                           |
| -------- | ---------------------------- | ---------------------------------------------------------------------- | ------------------------------------ |
| P0       | Provider and model readiness | First rewrite succeeds or fails with an actionable setup path          | Existing provider adapters           |
| P0       | Voice and example management | Users can define the style the product claims to reproduce             | Versioned local storage contract     |
| P1       | Rewrite execution lifecycle  | Rewrites show progress, can be cancelled, and do not leave stale state | Provider capability model            |
| P1       | Review and version workflow  | Users can inspect, edit, compare, and recover outputs                  | Run-level quality result model       |
| P1       | Durable documents            | Drafts and revisions can be managed and recovered                      | Storage adapter                      |
| P1       | End-to-end quality gates     | Product journeys and failure states remain reliable                    | Stable contracts from earlier phases |

Provider readiness comes first because every other workflow depends on a model
that can actually satisfy the pipeline contract. Voice management should follow
immediately because it is the core product capability currently represented by
placeholder controls.

## Coordination With The Eval Plan

- Eval Phase 0 and Phase 1 should begin alongside provider-readiness work.
- Freeze no-op, one-shot, and current-pipeline baselines as soon as the pilot
  dataset is ready and before changing prompts, quality gates, retry policy, or
  reference-example selection.
- Provider setup and compatibility work may proceed before that baseline because
  it fixes the execution boundary rather than intended rewrite behavior.
- Every later product phase that can change output must pass the v2 validation
  split before merge.
- Run the hidden holdout for scheduled efficacy and release decisions, not as a
  prompt-debugging loop.

## Phase 1: Trustworthy Provider And Model Readiness

### Goal

Make the first-run experience prove that the selected endpoint and model can run
StyleMakar, rather than merely proving that the endpoint exposes a model list.

### Shared provider contract

Replace the single loose provider object with a versioned provider profile:

```ts
type ProviderKind =
  'lmstudio' | 'ollama' | 'openai' | 'openrouter' | 'litellm' | 'custom';

type ProviderProfile = {
  id: string;
  name: string;
  kind: ProviderKind;
  baseUrl: string;
  model?: string;
  apiKeyRef?: string;
  reasoningEffort?: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
};

type ProviderCapabilityStatus = {
  endpointReachable: boolean;
  modelDiscovery: 'supported' | 'unsupported' | 'failed';
  selectedModelAvailable: boolean;
  structuredOutput: 'verified' | 'unverified' | 'failed';
  rewriteReady: boolean;
  checkedAt: string;
  error?: {
    kind:
      | 'unreachable'
      | 'authentication'
      | 'model-missing'
      | 'timeout'
      | 'invalid-json'
      | 'empty-completion'
      | 'rate-limit'
      | 'unknown';
    message: string;
  };
};
```

### Implementation

- Add first-run provider setup with presets for LM Studio and Ollama plus a
  custom OpenAI-compatible endpoint.
- Keep remote authenticated presets behind the secure-storage work already
  described in `tauri-desktop-app-plan.md`.
- Separate these actions:
  - test endpoint reachability
  - discover models
  - select or manually enter a model
  - run a small structured-output compatibility probe
- Make the configured model win over automatic model selection when it exists.
- If the configured model is missing, show the mismatch and ask the user to
  choose; do not silently replace it with the first name matching Gemma 4.
- Probe compatibility with a minimal JSON request that exercises the same
  response extraction contract used by the pipeline.
- Store the last capability result and its timestamp, but recheck before a
  rewrite after endpoint, model, reasoning, or credential changes.
- Replace LM Studio-specific errors with provider-neutral error types and
  actionable remediation copy.
- Exclude embedding-only models from suggested chat-model choices when model
  metadata or a safe probe can establish that distinction.
- Display local-versus-remote behavior before the first remote rewrite.

### Primary files

- `src/shared/types.ts`
- `src/shared/defaults.ts`
- `src/shared/modelSelection.ts`
- `src/client/api.ts`
- `src/client/tauri.ts`
- `src/client/storage.ts`
- `src/client/App.tsx`
- `src/server/lmStudio.ts` or a renamed provider-neutral adapter
- `src/server/api.ts`
- `src-tauri/src/lib.rs`

### Acceptance criteria

- A fresh user can configure LM Studio, Ollama, or a custom endpoint without
  editing files.
- `Ready` is shown only after the selected model passes the structured-output
  probe.
- A reachable provider with an incompatible model is not shown as rewrite-ready.
- A previously selected compatible model is not replaced merely because another
  Gemma model appears earlier in `/models`.
- Every expected provider failure maps to an actionable UI state.
- Provider settings behave consistently in browser and Tauri runtimes.
- Secrets are not added to `localStorage`, logs, debug output, exports, or
  screenshots.

## Phase 2: Real Voice And Reference-Example Management

### Goal

Let users define the target voice that StyleMakar uses instead of presenting a
single hard-coded `Product notes` profile and bundled examples.

### Data model

```ts
type VoiceProfileRecord = {
  id: string;
  name: string;
  description: string;
  rules: string[];
  antiRules: string[];
  examples: Array<{
    id: string;
    text: string;
    label?: string;
    createdAt: string;
  }>;
  createdAt: string;
  updatedAt: string;
  schemaVersion: number;
};
```

### Implementation

- Add create, rename, edit, duplicate, export, import, and delete operations for
  voice profiles.
- Make add-example controls open a real editor.
- Support paste, manual entry, and importing plain-text or Markdown examples.
- Allow users to remove, reorder, and label examples.
- Require a clear confirmation when deleting a profile referenced by documents.
- Include at least one starter profile, but keep starter content separate from
  user-owned profiles.
- Pass the selected profile and its current examples through both browser and
  Tauri rewrite adapters. Do not fall back to bundled examples when the user has
  explicitly selected an empty or different profile without explaining it.
- Show which examples were selected for each rewritten segment when detailed
  quality information is opened.
- Add profile validation for empty names, duplicate IDs, excessive example size,
  and malformed imports.

### Primary files

- `src/shared/types.ts`
- `src/shared/defaults.ts`
- `src/client/App.tsx`
- `src/client/storage.ts`
- `src/client/api.ts`
- `src/server/pipeline.ts`
- `src-tauri/src/lib.rs`

### Acceptance criteria

- A user can create two visibly different voice profiles and switch between
  them.
- Added examples are persisted and are present in the actual pipeline request.
- Profile changes do not mutate historical rewrite versions.
- Import and export round-trip without losing rules or examples.
- Empty, malformed, or deleted profiles fail safely with recoverable UI.
- Evals demonstrate that distinct profiles produce meaningfully different
  outputs from the same source while preserving the same facts.

## Phase 3: Rewrite Execution Lifecycle

### Goal

Replace a single opaque loading state with a controllable job that communicates
progress and cannot apply a stale result to the wrong document.

### Shared execution contract

```ts
type RewriteStage =
  | 'queued'
  | 'extracting-meaning'
  | 'analysing-style'
  | 'rewriting'
  | 'grading-style'
  | 'checking-meaning'
  | 'repairing-meaning'
  | 'assembling'
  | 'complete';

type RewriteProgress = {
  runId: string;
  stage: RewriteStage;
  segmentIndex: number;
  segmentCount: number;
  attempt: number;
  message: string;
};
```

### Implementation

- Give every rewrite a unique run ID.
- Expose progress events from the pipeline through the Express and Tauri
  adapters.
- Add a cancel action using `AbortController` in browser/server mode and a
  matching Tauri cancellation boundary.
- Ignore late results when the document, profile, provider, or run ID no longer
  matches the active request.
- Preserve the source and previous output when a run fails or is cancelled.
- Allow retry from the failed stage or segment where the provider contract makes
  that safe.
- Prefer provider-supported schema-constrained responses when available, while
  retaining the current JSON extraction fallback.
- Cache profile-level style analysis using a fingerprint of the profile and
  examples. Do not cache document meaning.
- Consider bounded parallelism for independent segments only after the expanded
  eval suite proves that document structure and provider stability are
  unaffected.
- Record stage latency and model-call counts in debug results and eval artifacts.

### Acceptance criteria

- Progress is visible and announced accessibly during every rewrite.
- Users can cancel a long rewrite and start another without receiving a stale
  result.
- Failure preserves the source and most recent successful output.
- Run diagnostics identify the failing stage, error class, elapsed time, and
  selected model without exposing secrets.
- Optimizations do not reduce meaning-preservation or style results on the
  validation and holdout eval sets.

## Phase 4: Review, Version, And Quality Workflow

### Goal

Make the rewrite result something a user can evaluate and work with, rather than
a read-only value behind a decorative version selector.

### Data model

```ts
type RewriteVersion = {
  id: string;
  runId: string;
  generatedText: string;
  editedText: string;
  providerId: string;
  model: string;
  voiceProfileId: string;
  quality: {
    meaning: 'passed' | 'failed' | 'not-checked';
    styleScore?: number;
    warnings: string[];
    preservedDetails: string[];
    risks: string[];
  };
  createdAt: string;
};
```

### Implementation

- Create a version after every successful rewrite instead of replacing the only
  output string.
- Make output editable while retaining the untouched generated text.
- Populate the version selector with real history and include timestamps or
  concise labels.
- Add side-by-side source/rewrite comparison on desktop and preserve the existing
  mobile compare sheet.
- Add accept, revert, duplicate, copy, and export operations.
- Present warnings and meaning/style results in plain language.
- Replace raw JSON as the default advanced view with a quality summary; keep raw
  diagnostics behind a developer disclosure.
- Never state `Meaning preserved` when the result failed or the check was not
  run.

### Acceptance criteria

- Rewriting again creates a recoverable version.
- Editing output does not destroy the original generated version.
- Users can compare any saved version to the source.
- Warnings and failed checks are visible before copy/export.
- Export uses the selected edited version and never includes hidden debug data or
  provider secrets.

## Phase 5: Durable Local Documents

### Goal

Give the local-first product a versioned, recoverable document store and basic
document management.

### Implementation

- Introduce a storage adapter shared by document and voice repositories.
- Use a versioned schema with validation and explicit migrations.
- Keep browser development backed by IndexedDB or a validated browser store.
- Store packaged-app documents in the Tauri app-data directory using atomic
  files or SQLite; choose one implementation before this phase begins.
- Add delete with confirmation, duplicate, search, sort, automatic title
  suggestion, and full-document import/export.
- Add a recoverable recent-deletion mechanism or trash state.
- Add backup/export of all documents and voice profiles.
- Separate user content, rewrite diagnostics, provider settings, and secrets.
- Detect and recover from corrupt or partially written records without silently
  replacing user data with demo content.

### Acceptance criteria

- Documents and rewrite versions survive restart and app update.
- Users can delete duplicate untitled drafts and recover accidental deletion.
- Storage corruption produces a recovery flow rather than silent data loss.
- Export/import round-trips documents, versions, and profile references.
- Browser and Tauri adapters pass the same storage contract tests.

## Phase 6: Product Quality Gates

### Goal

Cover the real user journeys and native boundary that unit tests do not currently
exercise.

### Automated tests

- Add a deterministic mock OpenAI-compatible provider supporting:
  - successful `/models` and `/chat/completions`
  - invalid JSON
  - empty completion
  - slow response and cancellation
  - authentication failure
  - rate limiting
  - missing model
  - incompatible embedding-only model
- Add end-to-end journeys for:
  - first-run LM Studio setup
  - incompatible model recovery
  - successful rewrite and progress
  - cancellation and retry
  - voice creation and example persistence
  - rewrite version history and editing
  - document persistence, deletion, and export
  - mobile sheets and desktop comparison
- Add Rust tests for URL validation, provider response normalization, redaction,
  cancellation, and persistence commands.
- Add automated accessibility checks plus manual keyboard and screen-reader
  smoke procedures.

### Required gates

```sh
pnpm format
pnpm lint
pnpm test
pnpm typecheck
pnpm build
pnpm docs:build
pnpm desktop:check
pnpm eval:v2:smoke
```

Packaged-app verification remains required for changes to Tauri provider,
storage, or export behavior.

### Acceptance criteria

- The default first-run-to-rewrite journey is automated in browser mode and
  manually verified in a packaged app.
- Provider failures have deterministic automated coverage.
- No release can show a provider as rewrite-ready if the compatibility probe
  fails.
- Accessibility checks cover error announcements, progress, focus management,
  dialogs, tabs, and keyboard-only operation.

## Milestones

### Milestone A: Reliable First Rewrite

- Phase 1 complete
- mock provider available
- first-run and incompatible-model end-to-end tests passing

This is the first recommended implementation boundary.

### Milestone B: Product Promise

- Phase 2 complete
- profile/example persistence complete
- selected examples verified in pipeline requests
- initial profile-differentiation eval slice passing

### Milestone C: Controlled Editing

- Phase 3 and Phase 4 complete
- progress, cancellation, versions, editing, and quality summaries working

### Milestone D: Durable Prototype

- Phase 5 and Phase 6 complete
- Tauri storage and native tests passing
- expanded validation evals passing without regressions

## Deferred Work

The following should not displace the work above unless product scope changes:

- code signing and notarization beyond the current unsigned-demo posture
- automatic updates
- Windows and Linux packaging
- hosted StyleMakar service
- cross-device sync
- analytics requiring user-content collection
- broad visual redesign

## Definition Of Done

This plan is complete when a new user can configure a compatible local provider,
create a voice from their own examples, run and cancel observable rewrites,
review and edit multiple versions with honest quality information, manage and
recover local documents, and complete the critical journeys under automated and
packaged-app verification.
