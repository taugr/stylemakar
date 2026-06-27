---
layout: home

hero:
  name: StyleMakar
  text: Local-first style rewriting
  tagline: Rewrite drafts into a target voice while preserving meaning, constraints, and concrete details.
  image:
    src: /logo.svg
    alt: StyleMakar logo
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: API Reference
      link: /guide/reference

features:
  - icon: 🧠
    title: Local model workflow
    details: Run the web app or Tauri desktop app against LM Studio or another OpenAI-compatible endpoint.
  - icon: ✅
    title: Meaning checks
    details: Preserve caveats, names, numbers, code blocks, and required terms during rewrite attempts.
  - icon: ✍️
    title: Style examples
    details: Use reference examples and a style profile to shape the rewritten output.
  - icon: 💻
    title: Desktop prototype
    details: Use the same writing workspace in the packaged macOS prototype when you want an app instead of a browser tab.
---

## Workspace Preview

![StyleMakar desktop workspace](/screenshots/workspace-desktop.png)

StyleMakar is currently a developer-facing prototype with a Vite web app, Express API, Tauri desktop shell, and local evaluation harness. Start with the getting started guide, then use the tutorials to run a rewrite, call the API, or package the desktop app.

## Why StyleMakar?

The name combines `style` with
[`makar`](https://dsl.ac.uk/entry/dost/makar), a Scots word for a maker, author,
or poet. In older Scottish literary use, a makar is someone skilled in the craft
of making language. StyleMakar uses that idea for a writing tool: it helps
reshape drafts into a chosen style while keeping the original meaning intact.
