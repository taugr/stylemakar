# Desktop App

StyleMakar includes a Tauri v2 desktop shell. The desktop path keeps the same React UI, but provider calls can run through Tauri commands instead of the development Express API.

## Run Desktop Development

```sh
pnpm desktop:dev
```

This starts the Vite frontend and the Tauri shell. Use it when you need to verify native provider calls, window behavior, or desktop packaging assumptions.

## Check The Desktop Build Surface

```sh
pnpm desktop:check
```

This runs TypeScript checking and Rust `cargo check` for `src-tauri/Cargo.toml`.

## Build A Desktop App

```sh
pnpm desktop:build
```

This produces the macOS `.app` bundle.

To build the unsigned prototype DMG:

```sh
pnpm desktop:bundle:mac
```

The prototype DMG is ad-hoc signed for local launch compatibility, but it is not
signed with Apple Developer credentials and is not notarized. macOS Gatekeeper
warnings are expected.

## Provider Expectations

The current verified local path is LM Studio with a Gemma 4 QAT model and `reasoningEffort: none`. The product direction is broader than LM Studio: future provider profiles should cover local and remote OpenAI-compatible providers, with secure API-key storage before enabling remote key-authenticated providers.

## Install Docs

Use the [prototype install guide](./install.md) when testing a release artifact.
Before broader distribution, the repo still needs provider profile management,
secure API-key storage, and a decision on signing/notarization.
