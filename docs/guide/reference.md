# Reference

## Scripts

| Script                        | Purpose                                                |
| ----------------------------- | ------------------------------------------------------ |
| `pnpm run dev`                | Run Vite and the API server for local web development. |
| `pnpm run dev:api`            | Run only the Express API server.                       |
| `pnpm run start`              | Serve the built app/API.                               |
| `pnpm run build`              | Typecheck and build the Vite app.                      |
| `pnpm run test`               | Run Vitest tests.                                      |
| `pnpm run lint`               | Run Oxlint.                                            |
| `pnpm run format`             | Check formatting with oxfmt.                           |
| `pnpm desktop:dev`            | Run the Tauri desktop app in development.              |
| `pnpm desktop:check`          | Typecheck and run Rust `cargo check`.                  |
| `pnpm desktop:build`          | Build the Tauri desktop app.                           |
| `pnpm eval:smoke`             | Run the Promptfoo smoke eval.                          |
| `pnpm eval:iterations`        | Run focused iteration evals.                           |
| `pnpm eval:iterations:matrix` | Run the full iteration matrix.                         |
| `pnpm docs:dev`               | Run this documentation site locally.                   |
| `pnpm docs:build`             | Build this documentation site.                         |
| `pnpm docs:preview`           | Preview the built documentation site.                  |

## Provider Settings

See [Provider Setup](./providers.md) for LM Studio startup steps, UI endpoint configuration, OpenAI-compatible endpoint requirements, and remote-provider limitations.

```ts
type ModelProviderSettings = {
  baseUrl: string;
  model?: string;
  reasoningEffort?: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
};
```

Default:

```ts
{
  baseUrl: 'http://localhost:1234/v1',
  model: 'gemma-4',
  reasoningEffort: 'none',
}
```

## Pipeline Options

```ts
type PipelineOptions = {
  includeDebug?: boolean;
  styleThreshold?: number;
  finalSmoothing?: boolean;
  maxRewriteIterations?: number;
  runMeaningCheck?: boolean;
};
```

## `GET /api/health`

Checks whether the default provider, or a supplied `baseUrl`, can list models.

```sh
curl http://127.0.0.1:5174/api/health
```

```sh
curl 'http://127.0.0.1:5174/api/health?baseUrl=http://localhost:11434/v1'
```

Response fields:

```ts
{
  gemma4Found: boolean;
  lmStudioReachable: boolean;
  model: string;
  ok: boolean;
  status: string;
  error?: string;
}
```

## `GET /api/models`

Lists models from the default provider or a supplied `baseUrl`.

```sh
curl 'http://127.0.0.1:5174/api/models?baseUrl=http://localhost:1234/v1'
```

## `POST /api/rewrite`

Runs the rewrite pipeline.

```sh
curl -X POST http://127.0.0.1:5174/api/rewrite \
  -H 'Content-Type: application/json' \
  --data '{
    "document": "Our platform leverages advanced AI to improve workflows.",
    "provider": {
      "baseUrl": "http://localhost:1234/v1",
      "model": "google/gemma-4-12b-qat",
      "reasoningEffort": "none"
    },
    "options": {
      "includeDebug": true,
      "maxRewriteIterations": 2,
      "runMeaningCheck": true
    }
  }'
```

## `POST /api/eval/rewrite`

Runs the eval rewrite endpoint against fixture profiles.

```json
{
  "source": "This paragraph needs a clearer product-note style.",
  "styleProfileId": "direct-technical",
  "providerId": "lmstudio",
  "model": "google/gemma-4-12b-qat",
  "options": {
    "maxRewriteIterations": 2,
    "reasoningEffort": "none",
    "runMeaningCheck": true,
    "runFinalSmoothing": false
  }
}
```

Fixture profiles live under `evals/fixtures/profiles/`.

## Eval Environment Variables

| Variable                           | Purpose                                                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------------------------- |
| `STYLEMAKAR_API_BASE_URL`          | StyleMakar API server URL. Defaults to `http://127.0.0.1:5174`.                                   |
| `STYLEMAKAR_EVAL_BASE_URL`         | OpenAI-compatible provider base URL for eval scripts.                                             |
| `STYLEMAKAR_EVAL_PROVIDER_ID`      | Provider id or URL sent to `/api/eval/rewrite`; takes precedence over `STYLEMAKAR_EVAL_BASE_URL`. |
| `STYLEMAKAR_EVAL_MODEL`            | Model id sent to the provider.                                                                    |
| `STYLEMAKAR_EVAL_REASONING_EFFORT` | Reasoning effort passed through to compatible providers. Defaults to `none`.                      |
| `STYLEMAKAR_EVAL_CASE_FILTER`      | Filter used by the matrix eval script.                                                            |
