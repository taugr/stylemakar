# StyleMakar

Local-first style rewriting app for turning drafts into a target voice while preserving meaning, constraints, and concrete details.

StyleMakar is a TypeScript/Vite app with:

- React writing UI
- Express API for local development and evals
- Tauri desktop prototype
- OpenAI-compatible provider support
- Promptfoo and custom eval scripts
- VitePress docs site

## Requirements

- Node.js 22.22.1+
- pnpm 11+
- LM Studio or another OpenAI-compatible provider
- A loaded chat model

The default provider is LM Studio at:

```text
http://localhost:1234/v1
```

## Quick Start

```sh
pnpm install
pnpm run dev
```

Open the app:

```text
http://127.0.0.1:5173
```

In development, Vite runs on `5173` and proxies `/api` to the Express server on `5174`.

## Provider Setup

Start LM Studio's local API server, or use another provider that exposes OpenAI-compatible `GET /models` and `POST /chat/completions` endpoints.

The default provider settings are:

```ts
{
  baseUrl: 'http://localhost:1234/v1',
  model: 'gemma-4',
  reasoningEffort: 'none',
}
```

In the UI, expand **Advanced checks** to edit the endpoint, refresh model discovery, and select the model.

Check provider health through the local API:

```sh
curl http://127.0.0.1:5174/api/health
```

Check a custom endpoint:

```sh
curl 'http://127.0.0.1:5174/api/health?baseUrl=http://localhost:11434/v1'
```

## Common Commands

```sh
pnpm run dev
pnpm run test
pnpm run typecheck
pnpm run lint
pnpm run format
pnpm run build
```

## Docs

Run the VitePress docs locally:

```sh
pnpm docs:dev
```

Build the docs:

```sh
pnpm docs:build
```

Docs source lives in `docs/`. GitHub Pages deployment is configured in `.github/workflows/pages.yml`, but Pages availability depends on the repository plan and visibility.

## API

Run the app/API:

```sh
pnpm run dev
```

Run the rewrite pipeline without using the UI:

```sh
curl -X POST http://127.0.0.1:5174/api/rewrite \
  -H 'Content-Type: application/json' \
  --data '{
    "document": "Our platform leverages advanced AI to improve workflows.",
    "provider": {
      "baseUrl": "http://localhost:1234/v1"
    },
    "options": {
      "includeDebug": true
    }
  }'
```

The API rewrites paragraph-sized text, grades style fit, and checks meaning preservation. Final smoothing is off unless `options.finalSmoothing` is set to `true`.

## Evals

Seed fixtures and run the Promptfoo smoke eval:

```sh
pnpm eval:smoke
```

Run focused iteration evals:

```sh
pnpm eval:iterations
```

Use a custom provider endpoint:

```sh
STYLEMAKAR_EVAL_BASE_URL=http://localhost:11434/v1 pnpm eval:iterations
```

Useful eval environment variables:

- `STYLEMAKAR_API_BASE_URL`
- `STYLEMAKAR_EVAL_BASE_URL`
- `STYLEMAKAR_EVAL_PROVIDER_ID`
- `STYLEMAKAR_EVAL_MODEL`
- `STYLEMAKAR_EVAL_REASONING_EFFORT`
- `STYLEMAKAR_EVAL_CASE_FILTER`

Eval result artifacts are ignored under `evals/results/`.

## Desktop

Run the Tauri desktop app in development:

```sh
pnpm desktop:dev
```

Check the desktop build surface:

```sh
pnpm desktop:check
```

Build the desktop app:

```sh
pnpm desktop:build
```

The current desktop path is a local-first prototype. Production distribution still needs signed/notarized release packaging and provider profile hardening before public desktop release.

## Project Layout

```text
src/client/       React UI, storage, API adapter, Tauri bridge
src/server/       Express routes and rewrite pipeline server integration
src/shared/       Shared types, defaults, segmentation, scoring, checks
src-tauri/        Tauri desktop shell and native commands
evals/            Promptfoo configs, fixtures, assertions, eval scripts
docs/             VitePress docs, specs, reports, screenshots
```

## Quality

Before pushing app changes, run:

```sh
pnpm run test
pnpm run typecheck
pnpm run lint
pnpm run format
pnpm run build
```

For docs changes, also run:

```sh
pnpm docs:build
```

For desktop changes, also run:

```sh
pnpm desktop:check
```
