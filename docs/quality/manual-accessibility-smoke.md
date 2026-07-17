# Manual accessibility smoke test

Run this checklist for releases that change the provider setup, rewrite flow,
voice manager, mobile sheets, or document actions.

## Keyboard

1. Start on the provider setup card and complete setup without a pointer.
2. Open the voice manager, traverse every control with Tab and Shift+Tab, and
   confirm focus cannot leave the modal.
3. Close the voice manager with Escape and confirm focus returns to the control
   that opened it.
4. At a 390 by 844 viewport, open each bottom sheet, confirm focus starts inside
   it, cycles inside it, closes with Escape, and returns to its trigger.
5. Run, cancel, edit, accept, copy, export, duplicate, delete, and undo a
   document using only the keyboard.

## Screen reader

1. Confirm provider checking and readiness changes are announced once.
2. Trigger missing-model and incompatible-output failures and confirm the alert
   includes a useful recovery action.
3. Run a rewrite and confirm stage and segment progress is announced without
   repeatedly interrupting normal navigation.
4. Confirm the selected rewrite version, meaning status, warnings, and accepted
   state are understandable without reading raw diagnostics.
5. Confirm the Source and Rewrite mobile tabs expose their selected state and
   associated tab panels.

Record the browser, assistive technology, operating system, failures, and date
in the release notes. Automated Playwright journeys cover alert roles, live
progress, modal semantics, mobile focus trapping, Escape handling, and trigger
focus restoration; this checklist covers the remaining perceptual behavior.
