# StyleMakar v0.1.1

Unsigned prototype macOS build for trusted testing.

## Artifact

- `StyleMakar_0.1.1_aarch64.dmg`

## Install

1. Download the DMG.
2. Open the DMG.
3. Drag `StyleMakar.app` to `Applications`.
4. Control-click `StyleMakar.app` and choose **Open** if macOS blocks the first
   launch.

## Verified Provider Path

- Provider: LM Studio
- Endpoint: `http://localhost:1234/v1`
- Model: `google/gemma-4-12b-qat`
- Reasoning effort: `none`

## Verification Checklist

- [x] `pnpm install --frozen-lockfile`
- [x] `pnpm format`
- [x] `pnpm lint`
- [x] `pnpm test`
- [x] `pnpm typecheck`
- [x] `pnpm docs:build`
- [x] `pnpm build`
- [x] `pnpm desktop:check`
- [x] `pnpm desktop:bundle:mac`
- [x] DMG checksum is valid with `hdiutil verify`.
- [x] DMG mounts and contains `StyleMakar.app` plus an `Applications` symlink.
- [x] Built app launches.
- [x] LM Studio model discovery works.
- [x] A short rewrite completes with LM Studio.

## Known Limitations

- The app is unsigned and not notarized.
- macOS Gatekeeper warnings are expected.
- Remote provider API-key storage is not ready.
- Automatic updates are not enabled.
- Windows and Linux packages are not included.
