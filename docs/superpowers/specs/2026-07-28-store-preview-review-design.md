# Store Preview Review Design

## Goal

Make generated results easy to review manually by showing each store's images together. The operator can visually compare store 4-9 outputs, then decide whether to regenerate.

## Scope

- Keep the review flow lightweight: generate once, inspect visually, regenerate when needed.
- Add grouped previews to the image result summary.
- Show one preview group per store in the result library.
- Keep existing actions: open, regenerate, download, archive, and manual review flags.
- Keep the existing output folders and download package unchanged.

## Data Flow

1. `listImages()` already returns each image with `store`, `storeLabel`, `file`, and `url`.
2. `buildImageResultSummary()` groups these images by store and returns `storePreviewGroups`.
3. The result library renders each group with the store label, image count, and up to four thumbnails.
4. The operator uses the visible comparison to decide whether to regenerate.

## Non-Goals

- No automatic similarity scoring.
- No AI image analysis.
- No per-image selection or approval state in this step.
- No change to generation output paths.

## Testing

- Unit test `buildImageResultSummary()` to verify images are grouped by store with correct labels, counts, and per-store previews.
- Full test suite after implementation.
- HTTP smoke test `/api/image-results` using a temporary task with generated placeholder PNG files.
