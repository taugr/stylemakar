# App Release Readiness Checklist

## Current Readiness

StyleMakar is ready for internal demo builds, but it is not ready for a public
desktop release. The prototype release target is an unsigned macOS DMG.

The app can be built and tested locally, and the Tauri shell can call an
OpenAI-compatible provider such as LM Studio. The remaining work is mostly
release engineering, install experience, secure provider handling, and
first-run product polish.

## Release Tracks

### Internal Demo Build

Goal: share a build with trusted testers who understand this is a prototype.

- [x] Web app build passes with `pnpm build`.
- [x] Unit and API tests pass with `pnpm test`.
- [x] Typecheck passes with `pnpm typecheck`.
- [x] Lint and format checks pass with `pnpm lint` and `pnpm format`.
- [x] Tauri app scaffold exists in `src-tauri/`.
- [x] Desktop runtime can call OpenAI-compatible `/models` and
      `/chat/completions` endpoints.
- [x] Add a `desktop:bundle:mac` script that explicitly builds macOS app and
      DMG artifacts.
- [x] Add an unsigned prototype DMG packager that avoids code signing and
      notarization.
- [x] Replace placeholder icon configuration with production icon assets.
- [x] Run `pnpm desktop:check` on a clean checkout.
- [x] Run `pnpm desktop:bundle:mac` on a clean checkout.
- [x] Launch the built `.app` and verify the LM Studio rewrite path.
- [x] Document prototype install/open steps and known Gatekeeper limitations for
      unsigned builds.
- [x] Verify the unsigned DMG mounts locally and contains `StyleMakar.app` plus
      an `Applications` symlink.
- [x] Add a tag-triggered GitHub Actions workflow that builds the unsigned DMG
      and uploads it to the matching GitHub Release.

### First Public macOS Release

Goal: ship a normal downloadable macOS app through GitHub Releases.

This track is deferred while StyleMakar is distributed as an unsigned prototype.

- [ ] Produce a signed and notarized `.dmg`.
- [ ] Confirm Apple Developer account access.
- [ ] Create or obtain a Developer ID Application certificate.
- [ ] Configure local signing without committing certificate material.
- [ ] Configure notarization credentials outside git.
- [x] Add a tag-triggered GitHub release workflow on a macOS runner for unsigned
      prototype DMGs.
- [x] Run release workflow gates before packaging:
      `pnpm format`, `pnpm lint`, `pnpm test`, `pnpm typecheck`,
      `pnpm desktop:check`, and the desktop bundle build.
- [x] Attach the `.dmg` to a GitHub Release with release notes.
- [x] Verify the downloaded release DMG checksum and mounted contents.
- [ ] Verify the downloaded DMG opens on a clean macOS machine with the expected
      unsigned-app Gatekeeper warning.
- [ ] Verify the installed app can discover local LM Studio models.
- [ ] Verify the installed app can complete a short rewrite.

## Product Readiness

- [ ] Add a first-run provider setup flow.
- [ ] Provide presets for LM Studio, Ollama, OpenAI, OpenRouter, LiteLLM, and a
      custom OpenAI-compatible endpoint.
- [ ] Add model discovery with a manual model entry fallback.
- [ ] Add a provider connection test before running the first rewrite.
- [ ] Make local vs remote provider behavior explicit in the UI.
- [ ] Add provider-specific error messages for reachability, authentication,
      model selection, invalid JSON, empty completions, and rate limits.
- [ ] Decide whether remote key-authenticated providers are enabled for the first
      public release.
- [ ] If remote key-authenticated providers are enabled, add secure API-key
      storage before release.
- [ ] Ensure API keys never appear in debug output, errors, exported documents,
      telemetry, logs, or screenshots.
- [ ] Add a clear empty state for users who have no local provider running.
- [ ] Add copy that explains document text leaves the machine when a remote
      provider is used.

## Packaging And App Metadata

- [x] Confirm `productName`, `identifier`, and `version` in
      `src-tauri/tauri.conf.json`.
- [x] Add production app icons to `bundle.icon`.
- [ ] Choose minimum supported macOS version.
- [ ] Decide whether the app should request network access beyond localhost.
- [ ] Review the Tauri content security policy before release.
- [x] Confirm bundle output names include the app version.
- [x] Add a release checklist template for each GitHub Release.

## Security And Privacy

- [ ] Run a final secret scan before each release.
- [ ] Keep Apple certificates, `.p12` files, app-specific passwords, API keys,
      and updater private keys out of git.
- [ ] Redact authorization headers and provider tokens from all error paths.
- [ ] Confirm exported documents contain only user-visible content.
- [ ] Confirm local persistence does not store provider secrets in plaintext.
- [ ] Add privacy notes for local providers and remote providers.
- [ ] Review Tauri permissions and capabilities for least privilege.

## Documentation

- [x] Add a user-facing install guide for macOS.
- [ ] Add LM Studio setup screenshots.
- [ ] Add Ollama OpenAI-compatible setup instructions.
- [ ] Add custom OpenAI-compatible endpoint setup instructions.
- [ ] Document known limitations for the first public release.
- [ ] Add troubleshooting for common local provider failures.
- [x] Add a release notes template.

## Quality Gates

- [x] `pnpm install --frozen-lockfile --ignore-scripts`
- [x] `pnpm format`
- [x] `pnpm lint`
- [x] `pnpm test`
- [x] `pnpm typecheck`
- [x] `pnpm docs:build`
- [x] `pnpm build`
- [x] `pnpm desktop:check`
- [x] `pnpm desktop:build`
- [x] `pnpm desktop:bundle:mac`
- [x] Manual smoke test of the built desktop app launch plus LM Studio rewrite
      path.
- [ ] Manual smoke test for provider configuration changes.

## Deferrals

These should not block the first internal demo build, but they should be
explicitly deferred if they do not make the first public release.

- [ ] Automatic updates.
- [ ] Windows packaging.
- [ ] Linux packaging.
- [ ] Hosted web deployment as a user-facing product.
- [ ] Telemetry or product analytics.
- [ ] Multi-provider profile syncing across devices.
