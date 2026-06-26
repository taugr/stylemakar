# Getting Started

This guide gets the StyleMakar web app running against a local OpenAI-compatible provider.

## Requirements

- Node.js `>=22.22.1`
- pnpm `11.9.0`
- LM Studio or another OpenAI-compatible provider
- A loaded model, ideally a Gemma 4 model for the current default path

## Install Dependencies

```sh
pnpm install
```

## Start A Local Provider

In LM Studio, open the Developer tab and start the local API server. Make sure it is reachable at:

```txt
http://localhost:1234/v1
```

The default provider settings are:

```ts
{
  baseUrl: 'http://localhost:1234/v1',
  model: 'gemma-4',
  reasoningEffort: 'none',
}
```

StyleMakar will discover the selected model when `/api/health` can reach LM Studio.

For full setup details, including custom OpenAI-compatible endpoints and current UI limitations, read [Provider Setup](./providers.md).

## Run The App

```sh
pnpm run dev
```

Open:

```txt
http://127.0.0.1:5173
```

The development setup runs Vite on port `5173` and the API server on port `5174`. Vite proxies `/api` requests to the API server.

## Verify The Provider

```sh
curl http://127.0.0.1:5174/api/health
```

A ready response includes `lmStudioReachable: true`, `ok: true`, and the selected model id.

## Run A Rewrite

Use the seeded `Q2 Product Strategy Draft`, or paste your own paragraph into the Source pane and click **Rewrite**.

The default workflow rewrites paragraph-sized segments, grades style fit, checks meaning preservation, and returns the final document. Final smoothing is off unless you explicitly enable it through API options.
