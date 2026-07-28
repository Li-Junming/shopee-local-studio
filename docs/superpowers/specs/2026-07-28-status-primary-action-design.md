# Status Primary Action Design

## Goal

Make the workflow easier to operate by showing the most useful action directly in the current status panel.

## Scope

- Extend task progress with one optional `primaryAction`.
- Render that action as a button in the status panel.
- Reuse existing endpoints and frontend functions.
- Keep the existing full action button row as backup.

## Actions

- `run-all`: start or continue the one-click workflow.
- `confirm-source-and-run`: confirm 1-store source and continue.
- `download`: download image package when the workflow is done.
- `regenerate-images`: retry image generation when image generation failed.
- `discover`: retry BigSeller draft lookup.
- `save`: retry BigSeller draft save.

## Non-Goals

- No automatic retry.
- No new backend workflow engine.
- No removal of existing manual buttons.

## Testing

- Unit tests verify `buildTaskProgress()` returns correct primary actions for source confirmation, ready state, done state, and selected failures.
- Full test suite.
- HTTP smoke verifies `/preflight` returns a `primaryAction`.
