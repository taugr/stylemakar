---
layout: home

hero:
  name: StyleMakar
  text: Local-first style rewriting
  tagline: Rewrite drafts into a target voice while preserving meaning, constraints, and concrete details.
  image:
    src: /screenshots/workspace-desktop.png
    alt: StyleMakar rewrite workspace
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: API Reference
      link: /guide/reference

features:
  - title: Local model workflow
    details: Run the web app or Tauri desktop app against LM Studio or another OpenAI-compatible endpoint.
  - title: Meaning checks
    details: Preserve caveats, names, numbers, code blocks, and required terms during rewrite attempts.
  - title: Style examples
    details: Use reference examples and a style profile to shape the rewritten output.
  - title: Eval harness
    details: Exercise the real pipeline through Promptfoo and focused iteration scripts.
---

## Workspace Preview

![StyleMakar desktop workspace](/screenshots/workspace-desktop.png)

StyleMakar is currently a developer-facing prototype with a Vite web app, Express API, Tauri desktop shell, and local evaluation harness. Start with the getting started guide, then use the tutorials to run a rewrite, call the API, or package the desktop app.
