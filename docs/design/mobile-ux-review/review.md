# StyleMakar Mobile UX Review

Date: 2026-06-16
Viewport: 390 x 844
Source: local app at `http://127.0.0.1:5173`

## Screenshots

The original screenshots for this review were local QA artifacts and are not
tracked with the docs site.

## Step Health

1. Initial workspace: usable, but desktop information architecture lands before the writing task.
2. Source editing: healthy core editor; the writing surface is readable and controls remain reachable.
3. Rewrite controls: functional, but the main action is too far down the page after document history and source content.
4. Output review: readable, but source and output are separated by a long vertical scroll instead of a focused compare flow.
5. Advanced checks: functional and understandable, but too prominent in the main page once expanded.

## Strengths

- The current layout has no horizontal overflow at 390px wide.
- Tap targets are generally large enough, especially New, Add examples, Rewrite, Copy, and Export.
- The visual system is consistent: restrained borders, blue primary action, green readiness status, and coral secondary action.
- The source and output panes remain legible on mobile, with good text size and line height.
- Advanced checks are behind disclosure by default, which matches the product goal of feeling like a writing tool first.

## UX Risks

- The first mobile screen prioritizes desktop navigation: brand, New, recent drafts, and model status consume the first viewport before the user reaches the document.
- Recent drafts are always expanded, which makes mobile feel like a document manager rather than a rewrite tool.
- The main workflow is a single long stack: source, controls, output, advanced, examples. The measured page height was 3,032px at 390px wide.
- Source and output are not paired on mobile. Users must scroll back and forth to compare meaning and phrasing.
- The Rewrite action is not persistent. After editing longer source text, the user has to scroll to find the action.
- Output remains populated while rewriting, so the loading state can be mistaken for a stale successful result.
- Advanced checks open inline and push the page much longer. This makes technical diagnostics feel equal in priority to the writing workflow.

## Accessibility Risks

- Reading order is technically coherent, but task order is heavy: navigation and history come before the primary editing task on every mobile visit.
- The active draft uses a small dot as part of the selected-state signal. The border and background help, but the dot alone would be weak.
- The Rewrite loading state changes button text, but there is no visible progress context near the output or status message for the whole rewrite job.
- Expanded debug JSON is readable visually, but it adds low-value code-like content into the primary reading flow on mobile.
- Screenshots cannot verify keyboard focus order, screen reader announcements, or live-region behavior; those still need implementation-level testing.

## Recommended Mobile Design

Use a task-first mobile shell instead of a stacked desktop shell.

### Top App Bar

- Compact header: StyleMakar on the left, model readiness as a small status chip, document switcher icon or title menu on the right.
- Move Recent drafts into a bottom sheet or drawer opened from the document title.
- Keep New in the document switcher sheet, not as the first full-width action on every screen.

### Primary Flow

- Make the document title compact and sticky under the app bar.
- Use two tabs or segmented controls: `Source` and `Rewrite`.
- Source tab contains the editor, word count, copy source, voice selector, Add examples, and a sticky bottom Rewrite button.
- Rewrite tab contains output, version selector, Copy, Export, and a compact meaning/style status summary.
- After tapping Rewrite, automatically switch to the Rewrite tab or show a bottom progress sheet, depending on whether output is already present.

### Compare Mode

- Add a lightweight `Compare` action on the Rewrite tab.
- Compare mode can show source and output as stacked paragraphs with matched scroll position or simple sections, not two full editor cards.
- Keep this optional so the default mobile path stays focused.

### Advanced Checks

- Keep the collapsed status row near the bottom of the Rewrite tab.
- Open advanced checks as a modal sheet instead of inline page content.
- Put model, endpoint, status, and debug JSON in that sheet. It should not interrupt the writing/review path.

### Examples

- Move examples behind the voice selector as `2 examples`.
- Tap opens an examples sheet with examples and Add example action.
- Do not leave examples as a full bottom section on the default mobile path.

## Suggested Implementation Sequence

1. Add a mobile-only shell below `720px`: app bar, document switcher sheet, and task tabs.
2. Split the current stacked workspace into Source and Rewrite mobile views while keeping desktop unchanged.
3. Add sticky mobile Rewrite action and clear loading/progress state near the output.
4. Move Advanced checks and examples into mobile sheets.
5. Run mobile verification at 390 x 844 and 430 x 932, plus keyboard/focus checks for the tab order and modal sheets.
