# Result Search Filters Design

## Goal

Make generated tasks and current image results easy to find after the workflow produces many store-specific outputs.

## Scope

- Keep the existing task search box and make its matching rules support product code, SKU, product name, task status, `store:<id>`, and image review status.
- Make the image result library search match product code, SKU, product name, task status, target store, store labels, image file names, and image review status or flags.
- Add a small current-task image preview filter for store IDs and file names, such as `store:4`, `01_product`, or `effect`.
- Keep archive browsing out of scope. Archived image versions are preserved on disk but not searched in this step.

## Architecture

- Add pure search helpers in `tools/shopee_local_studio/src/core.js` so matching rules are covered by unit tests.
- Update `tools/shopee_local_studio/src/server.js` so `/api/image-results?q=...` filters after current image summaries are built. This allows searches such as `approved` or `layout_similar` that live on image review state instead of raw task fields.
- Update `tools/shopee_local_studio/public/index.html` and `tools/shopee_local_studio/public/app.js` to add local filtering for the selected task image grid.

## User Flow

1. The user searches a product code or SKU in the task list to open a task.
2. The user searches `store:4`, `approved`, or `needs_regeneration` in the image result library to find relevant generated results.
3. Inside a selected task, the user filters image previews by store or file name before opening or downloading current images.

## Non-Goals

- No database migration.
- No login or external-user deployment.
- No historical archive search UI.
- No automatic deletion of old archives.

## Testing

- Unit test task matching with image review status.
- Unit test image result summary matching for store, review status, review flag, and file name.
- Unit test current task image matching for store and file name.
- Run the full Node test suite.
- Run a local HTTP smoke check against `/api/image-results?q=approved`.
