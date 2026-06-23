# Tauri Desktop App Plan

## Summary

Make StyleMakar a local-first desktop app built with Tauri. The desktop app should keep the current React writing experience, remove the need to run a separate web/API server, and let users configure any OpenAI-compatible model provider. LM Studio should become one preset provider, not the only supported backend.

The goal is an installable app where user documents, provider settings, and API keys stay on the user's machine. Hosted web deployment can remain a future option, but it should not drive the primary architecture.

## Product Direction

StyleMakar should be distributed as a desktop app for local and bring-your-own-provider use:

- Users install StyleMakar as a normal app.
- Users configure one or more model providers.
- Local providers such as LM Studio work without tunnels, proxies, or cloud hosting.
- Remote OpenAI-compatible providers work with user-owned API keys.
- Writing content and provider credentials are not sent through a StyleMakar-hosted backend.
- The app can still keep a browser/dev mode for local development and eval workflows.

## Provider Requirements

Support provider profiles with this minimum shape:

```ts
type ProviderProfile = {
  id: string;
  name: string;
  kind: 'lmstudio' | 'ollama' | 'openai' | 'openrouter' | 'litellm' | 'custom';
  baseUrl: string;
  model?: string;
  apiKeyRef?: string;
  reasoningEffort?: 'none' | 'minimal' | 'low' | 'medium' | 'high';
  headers?: Record<string, string>;
};
```

Initial presets:

- LM Studio: `http://localhost:1234/v1`, no API key by default.
- Ollama OpenAI-compatible endpoint: `http://localhost:11434/v1`, no API key by default.
- OpenAI: `https://api.openai.com/v1`, API key required.
- OpenRouter: `https://openrouter.ai/api/v1`, API key required.
- LiteLLM: user-supplied base URL and optional API key.
- Custom OpenAI-compatible: user-supplied base URL, model, and optional headers.

Provider behavior:

- Model discovery should call `GET /models` when supported.
- Chat completions should use `POST /chat/completions`.
- Providers must support custom base URLs.
- API keys must never be stored in `localStorage`.
- UI state may store a provider ID and non-secret display settings.
- Secret material should live in OS-backed secure storage or Tauri-managed secure storage.
- The app should preserve the existing `reasoningEffort` concept but allow providers to ignore it when unsupported.

## Architecture

### Current State

The app currently has:

- React/Vite frontend in `src/client`.
- Express API in `src/server`.
- Shared rewrite and scoring logic in `src/shared`.
- LM Studio adapter in `src/server/lmStudio.ts`.
- Browser calls to `/api/health`, `/api/models`, `/api/rewrite`, and `/api/eval/rewrite`.

This is good for development but awkward for desktop distribution because the app depends on a separate Node server.

### Target State

Move user-facing runtime behavior into Tauri:

- Vite builds the React UI.
- Tauri bundles the built frontend.
- Tauri commands replace the production Express API.
- Rust owns provider settings, secret access, filesystem access, and HTTP calls to model providers.
- Shared TypeScript logic remains available for browser/dev mode until it is ported or wrapped.
- The Express server remains available for evals and local development until the eval harness is migrated.

Recommended command boundary:

- `get_app_status`
- `list_provider_profiles`
- `save_provider_profile`
- `delete_provider_profile`
- `get_provider_models`
- `rewrite_document`
- `read_documents`
- `save_document`
- `export_document`

The frontend should call a small client adapter that chooses between:

- Tauri commands when running inside Tauri.
- Existing `/api/*` endpoints when running in browser/dev mode.

## Migration Phases

### Phase 1: Tauri Shell Prototype

Goal: Prove the packaged app can render the current UI and check provider connectivity.

Changes:

- Add `src-tauri/` using Tauri v2.
- Add `@tauri-apps/cli` and Tauri scripts:
  - `desktop:dev`
  - `desktop:build`
- Configure Tauri to use the Vite dev server in development.
- Configure Tauri to bundle the Vite production build.
- Add a minimal Rust command for app status.
- Add runtime detection in the frontend for Tauri vs browser.
- Keep the existing Express API for actual rewrites during the prototype.

Acceptance criteria:

- `pnpm desktop:dev` opens the app in a Tauri window.
- `pnpm desktop:build` creates a macOS app bundle on the local machine.
- The UI renders without layout regressions compared with the browser app.
- The app can show whether LM Studio is reachable.

### Phase 2: Provider Settings and Secret Storage

Goal: Let users configure provider profiles locally.

Changes:

- Add provider settings UI:
  - provider preset selector
  - base URL input
  - model selector/input
  - API key input for remote providers
  - connection test
  - active provider selector
- Store non-secret provider settings in app-local data.
- Store API keys in secure storage.
- Add validation for base URLs:
  - allow `http://localhost`
  - allow `http://127.0.0.1`
  - allow LAN/private addresses only after clear user confirmation
  - allow `https://` remote providers
  - warn on non-local `http://` providers
- Add a provider diagnostics panel that shows reachability, selected model, and last error.

Acceptance criteria:

- A user can add LM Studio, OpenAI, OpenRouter, LiteLLM, or a custom provider.
- API keys are not present in localStorage, exported documents, logs, or debug output.
- Model discovery works for LM Studio and at least one key-authenticated remote provider.
- Connection failures produce actionable messages.

### Phase 3: Native Rewrite Pipeline

Goal: Remove the production dependency on Express and `/api/rewrite`.

Changes:

- Add a Rust OpenAI-compatible client for:
  - `GET /models`
  - `POST /chat/completions`
- Move the production rewrite command behind `rewrite_document`.
- Preserve the existing rewrite response shape expected by the UI:
  - final content
  - per-segment output
  - warnings
  - model ID
  - optional debug details
- Decide whether to port the full rewrite pipeline to Rust or keep the pipeline in TypeScript temporarily.

Preferred path:

- First, keep core prompt construction and deterministic text helpers in TypeScript if that avoids a risky rewrite.
- Then port stable provider and transport code to Rust.
- Only port the full rewrite/scoring pipeline to Rust after behavior is covered by tests.

Temporary sidecar option:

- A Node sidecar may be acceptable for an early internal build.
- It should not be the long-term architecture because it adds process lifecycle, dependency, logging, and update complexity.

Acceptance criteria:

- Production desktop rewrites do not require `pnpm start` or an external StyleMakar server.
- Local LM Studio rewrites work from the packaged app.
- A remote OpenAI-compatible provider works from the packaged app.
- Existing rewrite behavior remains covered by tests.

### Phase 4: Local Document Storage

Goal: Move user document storage out of browser-only `localStorage`.

Changes:

- Store documents in the app data directory.
- Define a versioned local data format.
- Add import/export for documents.
- Add migration from existing browser `localStorage` when running dev/browser mode if practical.
- Keep debug traces separate from document content.

Acceptance criteria:

- Documents persist across app restarts.
- Documents can be exported without provider secrets.
- App data survives updates.
- Data format changes are versioned.

### Phase 5: Packaging and Release

Goal: Produce installable builds that non-developers can use.

Changes:

- Configure app metadata:
  - app name
  - bundle identifier
  - icons
  - version
  - copyright/license metadata
- Configure macOS app bundle output.
- Add code signing and notarization plan for public macOS distribution.
- Add updater strategy after the first stable build.
- Add release checklist for verifying LM Studio and remote provider flows.

Acceptance criteria:

- A signed macOS build opens without avoidable Gatekeeper friction.
- The app can be installed, launched, quit, and relaunched normally.
- Updates are either documented as manual downloads or handled through a configured updater.
- Release notes include provider compatibility and known setup requirements.

## UI Changes

Add a provider settings surface that feels like part of the writing app, not a developer console.

Required screens/states:

- First-run provider setup.
- Provider list.
- Add/edit provider.
- Test connection.
- Model picker with manual fallback.
- Offline/provider error state.
- Secret update flow.
- Local model setup hint for LM Studio and Ollama presets.

Do not expose raw debug details by default. Keep advanced settings behind disclosure:

- base URL
- custom headers
- reasoning effort
- raw model ID
- debug output

## Security and Privacy

Security requirements:

- Never store API keys in localStorage.
- Never include API keys in React state that is persisted.
- Never log API keys.
- Redact authorization headers and provider secrets in debug output.
- Warn before sending document text to a remote provider.
- Clearly distinguish local providers from remote providers.
- Treat custom provider URLs as user-trusted endpoints, not app-trusted endpoints.

Privacy requirements:

- Default copy should emphasize local-first behavior without claiming every provider is local.
- Provider setup should say when text will leave the user's machine.
- Exported documents should contain writing content and rewrite metadata, not secrets.

## Development Workflow

Keep these workflows:

- `pnpm dev`: browser frontend plus local Express API.
- `pnpm test`: existing unit tests.
- `pnpm eval:smoke`: existing eval smoke path.
- `pnpm build`: current web build.

Add these workflows:

- `pnpm desktop:dev`: Tauri app with Vite dev server.
- `pnpm desktop:build`: production desktop bundle.
- `pnpm desktop:check`: Rust checks plus frontend checks.

Tauri-specific Vite config should:

- keep the current development port stable
- avoid watching `src-tauri/`
- build to the frontend directory configured in Tauri
- keep browser/dev mode working

## Testing Plan

Unit tests:

- provider URL validation
- provider preset defaults
- secret redaction
- frontend API adapter selection
- rewrite response normalization

Integration tests:

- LM Studio-compatible mock for `/models` and `/chat/completions`
- remote provider mock with API key validation
- provider connection failure paths
- document persistence round trip

Manual verification:

- launch Tauri dev app
- build packaged app
- run rewrite with LM Studio
- run rewrite with a remote OpenAI-compatible mock or real test key
- quit and relaunch to confirm documents/settings persist
- confirm API keys are absent from localStorage and exported files

Regression checks:

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm format
pnpm build
pnpm desktop:build
```

## Open Questions

- Should the first public build be macOS-only?
- Should Ollama be supported through its OpenAI-compatible endpoint only, or should the app also support Ollama's native API?
- Which secure-storage plugin should be the default for API keys?
- Should remote providers require an explicit per-provider consent toggle before document text is sent?
- Should evals remain Express-based permanently, or should they call the same provider adapter used by Tauri?
- Should provider profiles sync across devices, or remain strictly local?

## Implementation Order

1. Add Tauri scaffold and scripts.
2. Add frontend runtime adapter for Tauri commands vs `/api`.
3. Add provider profile types and presets.
4. Add provider settings UI without secret persistence.
5. Add secure secret storage.
6. Add Rust provider connectivity commands.
7. Move rewrite requests into Tauri commands.
8. Move document persistence to app data.
9. Add packaging metadata, icons, signing notes, and release checklist.
10. Decide whether to port the remaining TypeScript pipeline logic to Rust or keep a tested hybrid.

## Non-Goals for the First Pass

- Hosted SaaS deployment.
- Bundling model weights.
- Running local inference inside StyleMakar.
- Team accounts or shared document storage.
- Multi-user sync.
- Marketplace billing.
