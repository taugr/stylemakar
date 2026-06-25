# stylemakar

Local-first style rewriting app with an LM Studio-backed rewrite pipeline.

## Requirements

- Node.js 22+
- pnpm 9+
- LM Studio running at `http://localhost:1234/v1`
- A loaded Gemma 4 model, such as `google/gemma-4-e4b`

## Development

```bash
pnpm install
pnpm run dev
pnpm run test
pnpm run lint
pnpm run format
pnpm run build
```

The built app/API can be served with:

```bash
pnpm run build
pnpm run start
```

The server listens on `http://127.0.0.1:5174`. In development, Vite listens on
`http://127.0.0.1:5173` and proxies `/api` to the API server.

## API

Check LM Studio and selected model:

```bash
curl http://127.0.0.1:5174/api/health
```

Check a custom OpenAI-compatible endpoint:

```bash
curl 'http://127.0.0.1:5174/api/health?baseUrl=http://localhost:11434/v1'
```

Run the rewrite pipeline without using the UI:

```bash
curl -X POST http://127.0.0.1:5174/api/rewrite \
  -H 'Content-Type: application/json' \
  --data '{
    "document": "Our platform leverages advanced AI to improve workflows.",
    "provider": {
      "baseUrl": "http://localhost:1234/v1"
    },
    "options": {
      "includeDebug": true
    }
  }'
```

By default, the API sends only paragraph-sized text to LM Studio for rewrite,
style grading, and meaning checks. Final smoothing is a local no-op unless
`options.finalSmoothing` is explicitly set to `true`.
