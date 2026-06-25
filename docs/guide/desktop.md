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

The current prototype has produced a macOS `.app` bundle. Unsigned builds are appropriate for developer demos, while a user-facing macOS release should be signed and notarized before distribution.

## Provider Expectations

The current verified local path is LM Studio with a Gemma 4 QAT model and `reasoningEffort: none`. The product direction is broader than LM Studio: future provider profiles should cover local and remote OpenAI-compatible providers, with secure API-key storage before enabling remote key-authenticated providers.

## Release Notes

Before public desktop distribution, the repo still needs release-ready bundle targets, production icons, signing and notarization configuration, repeatable release CI, and provider profile management.
