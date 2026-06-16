# StyleMakar Option Three UI Plan

## Goal

Implement the selected "Focus Flow" direction as the app's primary UI: a friendly, simple writing tool that helps users rewrite prose from examples of their existing work, while keeping advanced local-model controls available but quiet.

## Design Requirements

- Preserve the existing rewrite behavior: editing source text, selecting a model, calling the rewrite API, showing rewritten output, copy/export, document history, and debug details.
- Make the first impression a writing tool, not a developer control panel.
- Keep the desktop layout close to the selected visual:
  - left rail for brand, new document, recent drafts, and compact model readiness
  - large source editor on the left
  - compact central controls for selected voice/examples and the rewrite action
  - large output pane on the right
  - bottom examples strip
  - collapsed advanced checks row for model, meaning/scoring/debug details
- Expose advanced functionality only when needed through a disclosure, not always-visible controls.
- Keep the UI responsive so it remains usable on tablet/mobile widths.

## Implementation Plan

1. Restructure `src/client/App.tsx`.
   - Replace the topbar-heavy layout with the option-three composition.
   - Keep state and handlers for documents, provider/model selection, rewrite, copy, export, errors, and debug disclosure.
   - Add small presentational helpers for draft rows, example snippets, status chips, and advanced controls.

2. Restyle `src/client/styles.css`.
   - Use a quiet white/cool-gray product surface with blue primary action, green readiness state, and coral example accents.
   - Avoid nested cards and heavy shadows; use spacing, dividers, and light borders.
   - Match option three's proportions: fixed left rail, source pane, narrow action column, output pane, bottom examples/advanced bands.
   - Add responsive breakpoints that stack panes and keep controls readable.

3. Verify behavior.
   - Run unit/type/lint/format checks.
   - Start the dev server.
   - Use browser automation to verify:
     - page renders without overlap at desktop and mobile widths
     - source editing updates word count
     - advanced controls expand/collapse
     - recent draft selection works
     - rewrite button disabled/enabled state is correct
     - copy/export controls remain accessible

4. Create `design-qa.md`.
   - Compare the rendered app against the selected option-three visual.
   - Record pass/fail and any remaining polish notes.
