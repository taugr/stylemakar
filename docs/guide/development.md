# Development

## Project Shape

| Path          | Purpose                                                                        |
| ------------- | ------------------------------------------------------------------------------ |
| `src/client/` | React UI, browser API adapter, local storage, and Tauri runtime bridge.        |
| `src/server/` | Express routes, LM Studio provider helpers, and rewrite pipeline server entry. |
| `src/shared/` | Shared types, defaults, segmentation, scoring, and deterministic checks.       |
| `src-tauri/`  | Tauri v2 desktop shell and native provider commands.                           |
| `evals/`      | Promptfoo configs, fixtures, assertions, and iteration scripts.                |
| `docs/`       | VitePress documentation source and project specs/reports.                      |

## Quality Checks

Run the standard checks before publishing app or docs changes:

```sh
pnpm run test
pnpm run typecheck
pnpm run lint
pnpm run format
pnpm run build
```

For desktop changes, add:

```sh
pnpm desktop:check
```

For docs changes, add:

```sh
pnpm docs:build
```

## Local Ports

| Service         | URL                                      |
| --------------- | ---------------------------------------- |
| Vite app        | `http://127.0.0.1:5173`                  |
| API server      | `http://127.0.0.1:5174`                  |
| Docs dev server | VitePress prints the selected local URL. |

## Generated Files

The docs build output and cache are ignored:

```txt
docs/.vitepress/dist/
docs/.vitepress/cache/
```

Eval result artifacts are also ignored under `evals/results/`.
