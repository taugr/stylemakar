# StyleMakar Hybrid Mobile Layout Plan

Date: 2026-06-16
Target viewport: 390 x 844
Visual target: [hybrid-mobile-layout.png](hybrid-mobile-layout.png)

## Goal

Replace the current stacked desktop-on-mobile layout with a mobile-first workflow that makes rewriting reachable in one screen, while keeping desktop unchanged.

The hybrid direction combines:

- Source-first editing from option 1.
- Output review patterns from option 2.
- Sheet-based document and secondary controls from option 3.

## Product Shape

Mobile should feel like a focused writing tool, not a document manager. The primary path is:

1. Open document.
2. Edit or paste source.
3. Confirm voice/examples.
4. Tap Rewrite from a sticky bottom action.
5. Land on Rewrite view to review, copy, export, or compare.

Recent drafts, model details, debug output, and examples remain available, but they should not own the default page.

## Mobile Information Architecture

### App Header

- Compact top bar with StyleMakar brand, LM Studio readiness chip, and a document/menu affordance.
- Keep header height tight, roughly 52-60px.
- Do not show the full recent drafts list in the page body.

### Document Row

- Sticky row below the app header.
- Shows active document title, saved state, and chevron.
- Tapping opens the document switcher sheet.
- New draft lives inside that sheet.

### Main Tabs

- Two-segment control: `Source` and `Rewrite`.
- `Source` is default when a document is opened or no rewrite has run.
- `Rewrite` shows a small badge when output exists, such as `97 words` or `Ready`.
- Switching tabs must preserve editor state and scroll position where practical.

### Source View

- One main editor surface.
- Header: `Source`, short helper copy, edit icon.
- Body: editable source textarea.
- Footer: word count and Copy source.
- Voice strip beneath the editor:
  - `Based on Product notes`
  - `2 examples`
  - compact Add examples action
- Sticky bottom action:
  - primary Rewrite button
  - disabled when source is empty
  - loading state with clear text and disabled taps

### Rewrite View

- One main output surface.
- Header: `Rewrite`, version selector, and concise meaning/style status.
- Body: read-only rewritten text.
- Footer actions: Copy, Export, Compare.
- A compact `View source` row replaces the full source editor.
- `Rewrite again` can reuse the sticky bottom action.

### Sheets

Use mobile sheets for secondary workflows:

- Document switcher sheet: New draft, recent drafts, model ready status.
- Examples sheet: current reference examples and Add example.
- Checks sheet: model, endpoint, LM Studio status, debug JSON.
- Compare sheet or view: source and rewrite stacked for meaning comparison.

Sheets should trap focus, close via explicit close button and backdrop, and return focus to the triggering control.

## Implementation Plan

1. Add mobile state and view model in `src/client/App.tsx`.
   - Track `mobileTab`: `source` or `rewrite`.
   - Track active sheet: `documents`, `examples`, `checks`, `compare`, or `undefined`.
   - After a successful rewrite, switch `mobileTab` to `rewrite`.

2. Split mobile-only structure from desktop composition.
   - Keep existing desktop layout for widths above `720px`.
   - Add a mobile shell rendered with the same handlers and state.
   - Avoid duplicating business logic; only duplicate layout structure where necessary.

3. Build mobile source and rewrite panels.
   - Reuse current title, source textarea, output textarea, word counts, copy, export, rewrite, provider, and debug handlers.
   - Preserve existing accessibility labels.
   - Add `aria-selected` and panel semantics for Source/Rewrite tabs.

4. Add sheet components.
   - Start with simple local components inside `App.tsx`; extract later only if the file gets unwieldy.
   - Implement document switcher, examples, checks, and compare sheets.
   - Ensure close behavior, focus return, Escape key, and backdrop click work.

5. Update `src/client/styles.css`.
   - Add mobile shell styles under `@media (max-width: 720px)`.
   - Hide the desktop sidebar/workspace composition on mobile.
   - Use fixed/sticky bottom action with safe-area padding.
   - Keep the existing palette and radius scale.

6. Verify.
   - `pnpm run typecheck`
   - `pnpm run lint`
   - `pnpm run format`
   - `pnpm run build`
   - Browser checks at 390 x 844 and 430 x 932:
     - no horizontal overflow
     - Source tab default
     - Rewrite disabled on empty source
     - successful rewrite switches to Rewrite tab
     - document sheet opens and selects drafts
     - checks/examples sheets open and close
     - Copy and Export remain reachable
     - keyboard focus order is coherent

## Acceptance Criteria

- First mobile viewport shows the active document and source editor, not the recent drafts list.
- Primary Rewrite action is reachable without searching through the page.
- Output review is a dedicated mobile view, not a distant section below the source editor.
- Recent drafts, examples, and advanced checks are available through sheets.
- Desktop layout and behavior remain visually unchanged.
- Mobile screenshots match the hybrid target in structure, hierarchy, and spacing, with implementation-level differences allowed for real controls and textareas.
