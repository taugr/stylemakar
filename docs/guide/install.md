# Install The Prototype App

StyleMakar prototype releases ship as unsigned macOS DMG files. The app is meant
for trusted internal testing, not broad public distribution.

## Download

1. Open the GitHub Release for the version you want to test.
2. Download the `StyleMakar_<version>_aarch64.dmg` asset.
3. Double-click the DMG.
4. Drag `StyleMakar.app` to `Applications`.

The DMG includes an `Applications` symlink so the install flow matches normal
macOS drag-to-install apps.

## Open An Unsigned Build

Because the prototype is not signed or notarized with Apple Developer
credentials, macOS Gatekeeper may block the first normal open attempt.

Use this flow for trusted prototype builds:

1. Open `Applications`.
2. Control-click `StyleMakar.app`.
3. Select **Open**.
4. Confirm that you want to open the app.

Do not use this flow for unknown downloads. It is only appropriate for builds
from the project repository or a trusted internal release channel.

## Connect LM Studio

1. Open LM Studio.
2. Load `google/gemma-4-12b-qat` or another compatible chat model.
3. Start the LM Studio local server.
4. Keep the server at `http://localhost:1234/v1`, or configure the StyleMakar
   endpoint to match your LM Studio server URL.
5. Open StyleMakar and run a short rewrite.

For provider details and custom endpoints, see [Provider Setup](./providers.md).

## Verify The Local Provider

Before opening StyleMakar, confirm that LM Studio exposes models:

```sh
curl http://localhost:1234/v1/models
```

You can also verify a JSON completion with the same request shape StyleMakar
uses:

```sh
curl http://localhost:1234/v1/chat/completions \
  -H 'Content-Type: application/json' \
  --data '{
    "model": "google/gemma-4-12b-qat",
    "messages": [
      {
        "role": "system",
        "content": "Return the requested JSON object only. Do not include markdown."
      },
      {
        "role": "user",
        "content": "Rewrite this sentence in a concise professional style and return {\"finalText\": string}: Our team made the tool better so people can write faster."
      }
    ],
    "temperature": 0,
    "max_tokens": 360,
    "reasoning_effort": "none",
    "stream": false
  }'
```

The response should include `choices[0].message.content` with a JSON object that
contains `finalText`.

## Known Prototype Limitations

- The macOS app is unsigned and not notarized.
- The first release target is Apple Silicon macOS.
- Remote providers that require API keys are not ready for normal app usage
  until secure API-key storage exists.
- Automatic updates are not enabled.
- Windows and Linux packages are deferred.
