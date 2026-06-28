# CLI

StyleMakar includes a Node-based CLI for scriptable rewrites. The CLI calls the
same rewrite pipeline as the app, but it does not require the development web
server or desktop app to be running.

## Build The CLI

```sh
pnpm cli:build
```

Smoke-test the built command:

```sh
node dist/cli.js --help
```

The package exposes a `stylemakar` binary from `dist/cli.js`.

## Install Locally

Install the current checkout on your PATH:

```sh
pnpm cli:build
pnpm link --global
stylemakar --help
```

After a package is published, install it globally:

```sh
pnpm add --global stylemakar
```

## Install The Agent Skill

This repository includes a bundled agent skill:

```text
stylemakar-cli
```

Install it with skills.sh:

```sh
npx skills add taugr/stylemakar --skill stylemakar-cli
```

After installation, call the skill by name in your prompt:

```text
Use $stylemakar-cli to rewrite this draft with the local StyleMakar CLI.
```

Use the skill when you want an LLM agent to check provider readiness, choose the
right CLI command, pass custom style profiles or reference examples, and avoid
starting the web server unnecessarily.

## Rewrite Text

Rewrite a file:

```sh
stylemakar rewrite draft.md
```

Write the rewritten text to a file:

```sh
stylemakar rewrite draft.md --out rewritten.md
```

Read from stdin:

```sh
stylemakar rewrite < draft.md
```

Rewrite direct text:

```sh
stylemakar rewrite "Our platform leverages advanced AI to improve workflows."
```

Plain output writes only the rewritten content. Warnings are written to stderr.

## Provider Options

The CLI defaults to the same provider settings as the app:

```ts
{
  baseUrl: 'http://localhost:1234/v1',
  model: 'gemma-4',
  reasoningEffort: 'none',
}
```

Override the provider when needed:

```sh
stylemakar rewrite draft.md \
  --base-url http://localhost:1234/v1 \
  --model google/gemma-4-12b-qat \
  --reasoning-effort none
```

List available models:

```sh
stylemakar models --base-url http://localhost:1234/v1
```

Check provider reachability and selected model:

```sh
stylemakar health --base-url http://localhost:1234/v1
```

Add `--json` to `models` or `health` for machine-readable output.

## Style Inputs

By default, the CLI uses the built-in style profile and reference examples from
`src/shared/defaults.ts`.

The default style profile is:

```json
{
  "id": "technical",
  "name": "My Technical Style",
  "description": "Direct, specific, plain-spoken technical prose with minimal marketing language.",
  "rules": [
    "Use direct verbs and concrete nouns.",
    "Keep claims specific and grounded.",
    "Prefer short paragraphs with clear transitions.",
    "Preserve constraints, caveats, names, and numbers exactly."
  ],
  "antiRules": [
    "Do not add hype, exaggeration, or new claims.",
    "Do not imitate typos.",
    "Do not remove details to sound smoother."
  ]
}
```

The default reference examples are:

```json
[
  "We should keep the implementation small, because the hard part is verifying that the behavior survives real input.",
  "The goal is not to sound polished. The goal is to make the point clearly without losing the constraints."
]
```

Use a custom style profile:

```sh
stylemakar rewrite draft.md --profile ./profile.json
```

The profile file must match the `StyleProfile` shape:

```json
{
  "id": "plain",
  "name": "Plain",
  "description": "Direct, plain prose.",
  "rules": ["Use short sentences."],
  "antiRules": ["Do not add hype."]
}
```

Use custom reference examples:

```sh
stylemakar rewrite draft.md --examples ./examples.json
```

`examples.json` must be a JSON array of strings.

The CLI does not currently read saved desktop-app profiles or a persistent CLI
config file. Customization is per command through `--profile`, `--examples`,
`--base-url`, `--model`, and the other rewrite flags.

## Debug Output

Emit the full pipeline result:

```sh
stylemakar rewrite draft.md --json
```

Include segment-level debug details:

```sh
stylemakar rewrite draft.md --json --debug
```

Useful rewrite flags:

- `--final-smoothing`
- `--max-iterations <number>`
- `--no-meaning-check`

## Local Smoke Path

In this workspace, use the built file for local smoke tests:

```sh
node dist/cli.js --help
node dist/cli.js rewrite
```

`pnpm exec stylemakar` may not expose the root package binary before the package
is linked or installed.
