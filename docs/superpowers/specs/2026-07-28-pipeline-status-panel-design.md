# Pipeline Status Panel Design

## Goal

Show the operator where the one-click workflow currently is and what action is needed next.

## Scope

- Add a compact progress summary above the existing preflight and source panels.
- Reuse existing task status, preflight blockers, and 1-store source review state.
- Show:
  - current step
  - plain-language message
  - next action
  - severity level
- Keep detailed preflight and source confirmation panels available below the summary.

## Status Mapping

- Source lookup not started: start or continue the automatic workflow.
- Source confirmation pending: confirm the 1-store product before image generation.
- Image generation statuses: show image generation in progress.
- BigSeller discover statuses: show draft lookup in progress.
- BigSeller save statuses: show draft saving in progress.
- Done status: show completed.
- Failed or blocked statuses: show the blocker or failure reason and prompt retry after fixing it.

## Non-Goals

- No changes to image generation.
- No new queue engine.
- No automatic retry.
- No replacement of logs; logs stay as detailed evidence.

## Testing

- Unit test task status to progress mapping.
- HTTP smoke test that `/api/tasks/:id/preflight` returns a progress object.
