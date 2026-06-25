# Tauri Desktop Deployment Plan

## Summary

StyleMakar should ship first as a local-first Tauri desktop app, not as a hosted web app. The app is intended to work with local and user-owned OpenAI-compatible providers, so deployment should optimize for a normal installable desktop experience, localhost provider access, private document handling, and user-controlled credentials.

The prototype path is:

1. Ship unsigned internal `.dmg` builds for prototype testing.
2. Document macOS Gatekeeper limitations clearly.
3. Use signed and notarized `.dmg` builds only if Apple Developer credentials
   become available later.
4. Publish prototype artifacts through a tag-triggered GitHub Release workflow.
5. Add automatic updates, Windows, and Linux packaging after the prototype
   release path is stable.

## Current State

The repo currently has:

- Tauri v2 scaffold in `src-tauri/`.
- `pnpm desktop:dev`, `pnpm desktop:build`, and `pnpm desktop:check` scripts.
- macOS `.app` bundle output from Tauri.
- Unsigned macOS `.dmg` prototype output from `pnpm desktop:bundle:mac`.
- A tag-triggered GitHub Actions workflow that uploads the unsigned DMG to the
  matching GitHub Release.
- A frontend runtime adapter that uses Tauri commands inside the desktop app.
- Rust commands for OpenAI-compatible `GET /models` and `POST /chat/completions`.
- Verified local LM Studio flow with `google/gemma-4-12b-qat`.

The repo does not yet have:

- Production app icon configuration.
- Code signing configuration.
- Apple notarization configuration.
- Release CI.
- Updater artifacts.
- Provider profile management and secure API-key storage.
- A full release checklist.

## Deployment Strategy

### Primary Channel: Direct Desktop Download

Use a direct download model for prototype releases:

- Build an unsigned macOS `.dmg`.
- Attach it to a GitHub Release.
- Document LM Studio and Ollama setup in the release notes.
- Document that macOS will warn about the unsigned app.
- Document remote provider support only after API-key storage is implemented.

This avoids App Store review friction and keeps the release process appropriate
for a prototype developer/productivity tool that needs local provider access.

### Secondary Channel: Auto-Update

Add Tauri updater support after manual releases are working.

Do not make the updater part of the first public build unless the signing, release metadata, and rollback process have been tested. The updater adds another security-sensitive release surface and requires long-lived signing-key management.

### Deferred Channel: Hosted Web App

Keep the web app useful for development and evaluation workflows, but do not use it as the main user deployment. A hosted app is a worse fit for local models because browser-hosted access to `localhost` providers is more fragile and it pushes provider credentials and document privacy questions into a cloud architecture.

## Phase 1: Release-Ready Bundle Configuration

Goal: Produce the right local artifacts for macOS distribution.

Required changes:

- Keep `src-tauri/tauri.conf.json` bundle targets set to `["app"]` for the
  Tauri app bundle.
- Use `scripts/build-unsigned-macos-dmg.mjs` to package the `.app` into an
  unsigned prototype DMG without Apple Developer credentials.
- Add production icon files and configure them in `bundle.icon`.
- Verify app metadata:
  - `productName`
  - `version`
  - `identifier`
  - copyright
  - category, if useful
- Decide the initial minimum macOS version.
- Add a release build command that is explicit about artifact output.

Suggested scripts:

```json
{
  "desktop:bundle:mac": "node scripts/build-unsigned-macos-dmg.mjs"
}
```

Acceptance criteria:

- `pnpm desktop:bundle:mac` creates both `.app` and `.dmg` artifacts.
- Pushing a tag that matches `v${package.json.version}` creates or updates a
  GitHub Release and uploads the unsigned DMG.
- The app launches from the built `.app`.
- The app can be installed from the `.dmg`.
- The built app can discover LM Studio models.
- The built app can complete a short rewrite with LM Studio.

## Phase 2: Apple Developer Signing and Notarization

Goal: Make macOS builds open cleanly on user machines.

Status: deferred for the prototype because Apple Developer credentials are not
available.

Required setup:

- Enroll or confirm access to an Apple Developer account.
- Create or obtain a Developer ID Application certificate.
- Export the certificate as a `.p12`.
- Decide where signing credentials live:
  - local machine for manual release builds
  - GitHub Actions secrets for CI release builds
- Configure notarization credentials:
  - Apple ID
  - app-specific password
  - Apple Team ID
- Keep all signing materials out of git.

Required repo changes:

- Add documentation for required CI secrets.
- Add a signed build workflow after local signing is validated.
- Add release notes explaining that macOS builds are signed and notarized.

Likely CI secrets:

- `APPLE_CERTIFICATE`
- `APPLE_CERTIFICATE_PASSWORD`
- `APPLE_SIGNING_IDENTITY`
- `APPLE_ID`
- `APPLE_PASSWORD`
- `APPLE_TEAM_ID`
- `KEYCHAIN_PASSWORD`

Acceptance criteria:

- A clean macOS machine can download the DMG and open the app without avoidable Gatekeeper warnings.
- The signing identity is visible on the app bundle.
- Notarization succeeds for the release artifact.
- Signing credentials are not present in the repo, logs, or artifacts.

## Phase 3: GitHub Release Workflow

Goal: Make releases repeatable.

Recommended workflow:

- Trigger release builds from version tags such as `v0.1.0`.
- Run quality gates before packaging.
- Build macOS artifacts on a macOS runner.
- Sign and notarize artifacts.
- Attach the DMG to a GitHub Release.
- Include a concise release checklist in the GitHub Release body.

Quality gates:

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm format
pnpm desktop:check
pnpm desktop:build
```

Release workflow steps:

1. Check out the repo.
2. Install pnpm, Node, and Rust.
3. Install frontend dependencies.
4. Run test and static checks.
5. Import Apple signing certificate into a temporary keychain.
6. Build Tauri bundles.
7. Notarize macOS artifacts.
8. Upload artifacts to the GitHub Release.

Acceptance criteria:

- A tag can produce a complete release without manual local packaging.
- Failed checks stop the release before artifact upload.
- Release artifacts include the version in the filename.
- Release notes include provider compatibility and known limitations.

## Phase 4: Provider Readiness Before Public Promotion

Goal: Avoid shipping a desktop app that is technically packaged but not usable by non-developers.

Required product work:

- Add provider profile UI.
- Add provider presets:
  - LM Studio
  - Ollama OpenAI-compatible endpoint
  - OpenAI
  - OpenRouter
  - LiteLLM
  - Custom OpenAI-compatible provider
- Add model discovery and manual model entry.
- Add provider connection test.
- Add clear local vs remote provider labeling.
- Add per-provider error messages.
- Add secure API-key storage before enabling remote key-authenticated providers.

Security requirements:

- API keys must not be stored in `localStorage`.
- API keys must not be included in exported documents.
- API keys must not appear in debug traces.
- Authorization headers must be redacted in logs and errors.
- Remote providers should show clear copy that document text leaves the machine.

Acceptance criteria:

- A first-time user can set up LM Studio without reading developer docs.
- A first-time user can set up Ollama if its OpenAI-compatible endpoint is enabled.
- Remote provider setup is blocked or clearly marked incomplete until secure storage exists.
- Provider failures explain whether the problem is reachability, authentication, model selection, or response parsing.

## Phase 5: Updater

Goal: Add safe automatic updates after manual releases are reliable.

Required setup:

- Add the Tauri updater plugin.
- Generate updater signing keys.
- Store the private updater key outside git.
- Add the public updater key to `tauri.conf.json`.
- Enable updater artifact generation with `bundle.createUpdaterArtifacts`.
- Host update metadata and artifacts on GitHub Releases or a dedicated release endpoint.

Operational requirements:

- Document who controls the private updater key.
- Document how to rotate the updater key if needed.
- Document rollback behavior.
- Keep manual download releases available even after updater support is added.

Acceptance criteria:

- An installed older build can detect a newer release.
- The updater verifies signatures before applying an update.
- Update failure leaves the existing app usable.
- A release can be rolled back manually by installing a previous DMG.

## Phase 6: Windows and Linux

Goal: Expand after macOS packaging is boring.

Windows work:

- Add MSI or NSIS bundle targets.
- Decide code-signing certificate strategy.
- Verify local provider access to LM Studio and Ollama on Windows.
- Test installer, uninstall, and update behavior.

Linux work:

- Add AppImage and, if needed, `.deb` or `.rpm`.
- Verify WebKit and system dependency requirements.
- Test common desktop environments.
- Document package-specific limitations.

Acceptance criteria:

- Each platform has a native install artifact.
- Each platform has a release checklist.
- Each platform can run the local-provider rewrite smoke test.
- Platform-specific signing and trust behavior is documented.

## Release Checklist

Run before every user-facing release:

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm format
pnpm desktop:check
pnpm desktop:build
```

Manual verification:

- Launch the packaged app.
- Confirm the app opens without a dev server.
- Confirm documents render correctly.
- Confirm provider status appears.
- Confirm LM Studio model discovery works.
- Confirm a short rewrite works with a local OpenAI-compatible model.
- Quit and relaunch the app.
- Confirm persisted document and provider state.
- Install from the DMG on a clean or alternate macOS account.
- Confirm no signing or notarization warnings beyond expected first-run prompts.

Release notes should include:

- Supported platforms.
- Supported provider presets.
- Known provider limitations.
- Whether remote provider API keys are supported.
- Whether automatic updates are enabled.
- Minimum macOS version.
- Basic LM Studio setup steps.

## CI Secret Handling

Never commit:

- Apple certificates.
- App-specific passwords.
- Updater private keys.
- API keys.
- Generated keychains.
- Notarization logs that include sensitive account details.

Store secrets in the release system only. Prefer GitHub Actions secrets for CI and local keychain storage for manual release builds.

## Versioning

Use semver-style app versions:

- `0.1.x`: internal and early external test builds
- `0.2.x`: provider profiles and secure storage
- `0.3.x`: updater-enabled builds
- `1.0.0`: stable local-first desktop release

Every release should update:

- `package.json` version
- `src-tauri/Cargo.toml` version
- `src-tauri/tauri.conf.json` version
- Git tag
- GitHub Release notes

## Open Questions

- Should the first external build be Apple Silicon only, or universal macOS?
- Should the app support macOS auto-update before remote providers are added?
- Should provider setup require explicit consent before sending text to remote providers?
- Should the release workflow publish drafts first, or immediately publish tagged releases?
- Should the updater endpoint be GitHub Releases or a dedicated release bucket?
- Should we keep the Express web mode as a supported developer-only mode or a secondary product surface?

## Near-Term Implementation Order

1. Add DMG bundle target and production icon config.
2. Add local release checklist docs.
3. Validate unsigned DMG install locally.
4. Set up Apple Developer signing materials.
5. Validate signed and notarized local DMG.
6. Add GitHub Actions release workflow.
7. Add provider profile UI and secure storage.
8. Add remote provider smoke test.
9. Ship first signed manual macOS release.
10. Add updater only after manual release is repeatable.
