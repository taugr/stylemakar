# Tutorials

## Rewrite Your First Draft

1. Run `pnpm run dev`.
2. Open `http://127.0.0.1:5173`.
3. Confirm the provider pill says the model is ready.
4. Select the seeded `Q2 Product Strategy Draft` or paste new source text.
5. Keep `Product notes` selected as the voice.
6. Click **Rewrite**.
7. Copy or export the rewritten output.

![StyleMakar desktop workspace with source and output panes](/screenshots/workspace-desktop.png)

## Use The Mobile Layout

Resize the app below `720px` or open it on a phone-sized viewport. The mobile shell splits the workflow into Source and Rewrite tabs with bottom actions for checks and rewriting.

![StyleMakar mobile source tab](/screenshots/workspace-mobile.png)

## Teach StyleMakar Your Voice

1. Open **Style Lab** from the sidebar or the active voice row.
2. Start **Voice Coach**.
3. Choose which of the two blinded versions sounds more like you. You can also
   select tie, neither, or write your own version.
4. Review every inferred preference before saving it.
5. With a compatible provider connected, run the blinded comparison between
   the prior and proposed voices.
6. Use **Fine-tune my voice** later to focus on directness, warmth, formality,
   concision, sentence rhythm, vocabulary, or explanation structure.

The curated coach works offline. Adaptive examples are optional and pass a
meaning check before appearing. StyleMakar stores calibration evidence with the
local voice profile and never activates an inferred preference before review.

When you substantially edit and accept a rewrite, StyleMakar may suggest a
specific preference based on that edit. The voice changes only if you choose
**Save preference**.

## Call The Rewrite API

Run the development API:

```sh
pnpm run dev
```

Send a rewrite request:

```sh
curl -X POST http://127.0.0.1:5174/api/rewrite \
  -H 'Content-Type: application/json' \
  --data '{
    "document": "Our platform leverages advanced AI to improve workflows.",
    "options": {
      "includeDebug": true
    }
  }'
```

Use `provider.baseUrl`, `provider.model`, and `provider.reasoningEffort` when you want to override the default LM Studio settings. See [Provider Setup](./providers.md) for LM Studio and OpenAI-compatible provider requirements.

## Run A Focused Eval

The eval harness seeds local fixtures and calls the real rewrite pipeline.

```sh
pnpm eval:smoke
```

For iteration comparisons:

```sh
pnpm eval:iterations
```

For the full matrix:

```sh
pnpm eval:iterations:matrix
```

Validate the curated personalisation contract:

```sh
pnpm eval:personalisation
```

Eval results are written under ignored `evals/results/`. Use `STYLEMAKAR_EVAL_BASE_URL`, `STYLEMAKAR_EVAL_PROVIDER_ID`, `STYLEMAKAR_EVAL_CASE_FILTER`, `STYLEMAKAR_EVAL_MODEL`, and `STYLEMAKAR_EVAL_REASONING_EFFORT` to keep iteration runs targeted.

## Capture Updated Docs Screenshots

Start the app, then capture fresh screenshots from the seeded workspace:

```sh
pnpm run dev
```

Save source screenshots under:

```txt
docs/public/screenshots/
```

VitePress serves those files from `/screenshots/<filename>`.
