# StyleMakar

<p align="center">
  <img src="./docs/public/logo.svg" alt="StyleMakar logo" width="160" />
  <br />
  <a href="https://github.com/taugr/stylemakar/releases/latest">
    <img src="https://img.shields.io/github/v/release/taugr/stylemakar" alt="latest release" />
  </a>
  <a href="./LICENSE">
    <img src="https://img.shields.io/github/license/taugr/stylemakar" alt="license" />
  </a>
  <a href="https://taugr.github.io/stylemakar/">
    <img src="https://img.shields.io/badge/docs-GitHub%20Pages-2563eb" alt="documentation" />
  </a>
  <br />
  Local-first style rewriting app for turning drafts into a target voice while preserving meaning, constraints, and concrete details.
</p>

> StyleMakar is a prototype. The macOS app is currently distributed as an
> unsigned DMG for trusted testing, so Gatekeeper warnings are expected.

## Features

- Local-first React writing workspace
- Tauri desktop prototype for macOS
- OpenAI-compatible provider support, verified with LM Studio
- Meaning checks for caveats, names, numbers, code blocks, and required terms
- Promptfoo and custom eval scripts for rewrite quality checks
- VitePress documentation site

## Why StyleMakar?

The name combines `style` with
[`makar`](https://dsl.ac.uk/entry/dost/makar), a Scots word for a maker, author,
or poet. In older Scottish literary use, a makar is someone skilled in the craft
of making language. StyleMakar uses that idea for a writing tool: it helps
reshape drafts into a chosen style while keeping the original meaning intact.

## Requirements

- Node.js 22.22.1+
- pnpm 11+
- LM Studio or another OpenAI-compatible provider
- A loaded chat model

## Quickstart

```sh
pnpm install
pnpm run dev
```

Open the app:

```text
http://127.0.0.1:5173
```

In development, Vite runs on `5173` and proxies `/api` to the Express server on
`5174`.

## Provider Setup

Start LM Studio's local API server, or use another provider that exposes
OpenAI-compatible `GET /models` and `POST /chat/completions` endpoints.

The default provider settings are:

```ts
{
  baseUrl: 'http://localhost:1234/v1',
  model: 'gemma-4',
  reasoningEffort: 'none',
}
```

In the UI, expand **Advanced checks** to edit the endpoint, refresh model
discovery, and select the model.

Check provider health through the local API:

```sh
curl http://127.0.0.1:5174/api/health
```

Check a custom endpoint:

```sh
curl 'http://127.0.0.1:5174/api/health?baseUrl=http://localhost:11434/v1'
```

## Prototype Desktop App

StyleMakar ships first as an unsigned macOS prototype DMG for trusted testers.
Download the latest build from
[GitHub Releases](https://github.com/taugr/stylemakar/releases/latest), then
follow the [prototype install guide](./docs/guide/install.md).

Build the desktop app locally:

```sh
pnpm desktop:check
pnpm desktop:bundle:mac
```

The generated DMG lives under `src-tauri/target/release/bundle/dmg/`.

## Common Commands

```sh
pnpm run dev
pnpm run test
pnpm run typecheck
pnpm run lint
pnpm run format
pnpm run build
pnpm docs:build
pnpm desktop:check
```

## Docs

The documentation site lives in `docs/` and is published with GitHub Pages:

- [StyleMakar docs](https://taugr.github.io/stylemakar/)
- [Getting started](./docs/guide/getting-started.md)
- [Provider setup](./docs/guide/providers.md)
- [Desktop app](./docs/guide/desktop.md)

Run the docs locally:

```sh
pnpm docs:dev
```

Build the docs site:

```sh
pnpm docs:build
```

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

The API rewrites paragraph-sized text, grades style fit, and checks meaning
preservation. Final smoothing is off unless `options.finalSmoothing` is set to
`true`.

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

Prototype release builds should also run:

```sh
pnpm desktop:bundle:mac
```
