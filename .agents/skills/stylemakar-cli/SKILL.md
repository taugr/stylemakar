---
name: stylemakar-cli
description: Use when rewriting text, checking provider/model readiness, customizing style profiles or reference examples, or automating StyleMakar through the stylemakar Node CLI.
---

# StyleMakar CLI

Use `stylemakar` for scriptable local-first rewrites. The CLI calls the
StyleMakar rewrite pipeline directly; it does not require the Express web
server, browser app, or Tauri desktop app to be running.

## Command Resolution

If `stylemakar` is available on `PATH`, use it directly:

```bash
stylemakar --help
```

In the StyleMakar repository, the reliable local smoke path is the built file:

```bash
pnpm cli:build
node dist/cli.js --help
```

After linking the checkout globally, `stylemakar` should resolve:

```bash
pnpm cli:build
pnpm link --global
stylemakar --help
```

If `pnpm exec stylemakar` fails in the repo checkout, fall back to
`node dist/cli.js`; pnpm may not expose the root package bin before the package
is linked or installed.

## Default Workflow

1. Check provider reachability before running an expensive rewrite.

   ```bash
   stylemakar health --json
   ```

   The default provider is `http://localhost:1234/v1`. Pass `--base-url` for a
   different OpenAI-compatible endpoint.

2. List models when the selected model is unclear.

   ```bash
   stylemakar models --base-url http://localhost:1234/v1
   ```

   The selected model is marked with `*` in text output.

3. Run a rewrite from a file, stdin, or direct text.

   ```bash
   stylemakar rewrite draft.md --out rewritten.md
   stylemakar rewrite < draft.md
   stylemakar rewrite "Our platform leverages advanced AI to improve workflows."
   ```

   Plain rewrite output is only the rewritten text on stdout. Warnings are
   written to stderr.

4. Use JSON when the caller needs model, warnings, word counts, or segment
   details.

   ```bash
   stylemakar rewrite draft.md --json
   stylemakar rewrite draft.md --json --debug
   ```

   The rewritten text is in `content`. Segment-level details are in `segments`;
   `--debug` includes deeper pipeline diagnostics.

## Customization

The CLI uses built-in defaults unless flags are provided:

- Provider: `http://localhost:1234/v1`
- Model preference: `gemma-4`
- Reasoning effort: `none`
- Style profile and reference examples: from `src/shared/defaults.ts`

Override provider settings:

```bash
stylemakar rewrite draft.md \
  --base-url http://localhost:1234/v1 \
  --model google/gemma-4-12b-qat \
  --reasoning-effort none
```

Use a custom style profile:

```bash
stylemakar rewrite draft.md --profile ./profile.json
```

`profile.json` must be a `StyleProfile` object:

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

```bash
stylemakar rewrite draft.md --examples ./examples.json
```

`examples.json` must be a JSON array of strings.

The CLI does not currently read saved desktop-app profiles or a persistent CLI
config file. Pass customization explicitly per command.

## Command Selection

- Need provider status: `health --json`.
- Need available models: `models`, optionally with `--json`.
- Need only rewritten text: `rewrite <input>`.
- Need to save output: `rewrite <input> --out <path>`.
- Need machine-readable result: `rewrite <input> --json`.
- Need diagnostics: `rewrite <input> --json --debug`.
- Need a different style: `rewrite <input> --profile <profile.json>`.
- Need examples of target voice: `rewrite <input> --examples <examples.json>`.
- Need faster/cheaper checks during exploration: consider
  `--max-iterations 0` or `--no-meaning-check`, but mention the reduced
  verification to the user.

## Guardrails

- Verify `health` before assuming a local provider is running.
- Do not start the web server for CLI use unless the user also needs the web
  app/API.
- Prefer file or stdin input for multi-paragraph content; quote direct text in
  the shell.
- Use `--out` for file writes rather than shell redirection when preserving
  stderr warnings matters.
- Use `--json` when downstream automation needs structured data; otherwise
  plain output is easier to pipe.
- Treat `--debug` output as potentially large and prompt-like. Avoid copying it
  into final answers unless the user asks for diagnostics.
