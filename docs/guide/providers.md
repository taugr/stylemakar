# Provider Setup

StyleMakar talks to model providers through an OpenAI-compatible HTTP API. That means the provider must expose OpenAI-style endpoints such as `GET /models` and `POST /chat/completions`. It does not mean the provider needs to publish an OpenAPI schema.

## Configure The UI

The web UI stores provider settings in browser local storage.

1. Open StyleMakar.
2. Expand **Advanced checks**.
3. Edit **Endpoint** to the provider base URL, such as `http://localhost:1234/v1`.
4. Wait for the status and model list to refresh.
5. Select the model you want to use.
6. Run a rewrite.

The endpoint must include `http://` or `https://`. Do not include `/models` or `/chat/completions`; StyleMakar appends those endpoint paths itself.

You can also use another provider through API requests by passing `provider.baseUrl`, `provider.model`, and optional `provider.reasoningEffort` to `POST /api/rewrite`.

Future desktop provider profile work should add editable presets, secure API-key storage, and clearer local-vs-remote labeling.

## LM Studio

LM Studio is the default development provider.

1. Install and open LM Studio.
2. Download or load a compatible chat model. The current verified path is a Gemma 4 QAT model.
3. Open the Developer tab.
4. Start the local API server.
5. Keep the server port at `1234`, or update request examples to match your chosen port.

The default StyleMakar provider settings are:

```ts
{
  baseUrl: 'http://localhost:1234/v1',
  model: 'gemma-4',
  reasoningEffort: 'none',
}
```

LM Studio can also start its server from the terminal:

```sh
lms server start
```

Check that LM Studio exposes models:

```sh
curl http://localhost:1234/v1/models
```

Then check StyleMakar's API health endpoint:

```sh
curl http://127.0.0.1:5174/api/health
```

A ready response includes `lmStudioReachable: true`, `ok: true`, and a model id. If `gemma4Found` is false, StyleMakar can still use the selected model, but the default Gemma path was not detected.

## Other OpenAI-Compatible Providers

Any provider must support this minimum contract:

| Requirement      | Expected Shape                                                                                      |
| ---------------- | --------------------------------------------------------------------------------------------------- |
| Base URL         | HTTP or HTTPS URL without a trailing endpoint path beyond `/v1`                                     |
| List models      | `GET {baseUrl}/models` returning OpenAI-style `data[].id` values                                    |
| Chat completions | `POST {baseUrl}/chat/completions` accepting `model`, `messages`, `temperature`, and `stream: false` |
| Response body    | OpenAI-style `choices[0].message.content` text                                                      |
| JSON responses   | The model must be able to return JSON objects when prompted                                         |

Example request using a custom local provider:

```sh
curl -X POST http://127.0.0.1:5174/api/rewrite \
  -H 'Content-Type: application/json' \
  --data '{
    "document": "Our platform leverages advanced AI to improve workflows.",
    "provider": {
      "baseUrl": "http://localhost:11434/v1",
      "model": "gemma3",
      "reasoningEffort": "none"
    },
    "options": {
      "includeDebug": true
    }
  }'
```

For a remote provider, use `https://` and the provider's model id:

```json
{
  "provider": {
    "baseUrl": "https://your-provider.example/v1",
    "model": "provider-model-id"
  }
}
```

Remote providers that require API keys are not ready for normal app usage yet, because StyleMakar does not currently provide secure API-key storage. Do not put secrets in docs, checked-in files, screenshots, or shared curl examples.

## Command-Line Evals

The eval helper scripts call StyleMakar's local API server and can point that server at a different model endpoint.

```sh
STYLEMAKAR_EVAL_BASE_URL=http://localhost:11434/v1 pnpm eval:iterations
```

Use an explicit provider id when you want to pass a named provider or URL through the eval API:

```sh
STYLEMAKAR_EVAL_PROVIDER_ID=http://localhost:11434/v1 pnpm eval:iterations:matrix
```

You can combine endpoint, model, and reasoning settings:

```sh
STYLEMAKAR_EVAL_BASE_URL=http://localhost:1234/v1 \
STYLEMAKAR_EVAL_MODEL=google/gemma-4-12b-qat \
STYLEMAKAR_EVAL_REASONING_EFFORT=none \
pnpm eval:iterations
```

`STYLEMAKAR_EVAL_PROVIDER_ID` takes precedence over `STYLEMAKAR_EVAL_BASE_URL`. If neither is set, evals use the built-in `lmstudio` provider id.

## Troubleshooting

| Symptom                                   | Check                                                                       |
| ----------------------------------------- | --------------------------------------------------------------------------- |
| `provider.baseUrl must be an http(s) URL` | Include `http://` or `https://`; `localhost:1234/v1` is not enough.         |
| `/api/health` returns `503`               | Start LM Studio's server and verify `curl http://localhost:1234/v1/models`. |
| `/api/models` returns `502`               | Confirm the provider supports `GET /models` at the configured base URL.     |
| Rewrite fails with a provider error       | Confirm the model id is loaded and accepted by `POST /chat/completions`.    |
| Empty or invalid JSON response            | Try the verified Gemma QAT path or a stronger instruction-following model.  |

## Source Docs

- [LM Studio local API server](https://lmstudio.ai/docs/developer/core/server)
- [LM Studio OpenAI compatibility endpoints](https://lmstudio.ai/docs/developer/openai-compat)
