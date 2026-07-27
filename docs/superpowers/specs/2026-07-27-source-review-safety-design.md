# Source Review Safety Design

## Goal

Add a safety gate between 1-store product lookup and AI image generation so an incorrect SKU match cannot automatically create batches of wrong product images.

## Design

Local Studio will add a source review state to each task. When BigSeller source lookup downloads 1-store product images, the task is marked `source_review_required`, stores the source title, edit URL, detail, and source image paths, and waits for manual confirmation. Manual uploaded image paths and older tasks without this review flag continue to work.

Image config generation, image generation, regeneration, and the full pipeline will check this safety gate before writing `image2.jobs.json`. If a task has downloaded 1-store source images but has not been confirmed, those actions stop and record a clear log message instead of continuing.

The task page will show a compact source review panel with the 1-store title, SKU group, edit link, source image preview, and two controls: confirm the source or mark it wrong. Confirming records a timestamp and allows generation. Marking it wrong clears the confirmation, keeps the images for inspection, and tells the user to rerun lookup or manually upload images.

## Safety Checks

- A task cannot confirm source lookup unless it has at least one source image.
- Generation is blocked when `sourceReviewRequired` is true and `sourceConfirmedAt` is empty.
- Full pipeline stops at source review instead of running image generation.
- Logs record source lookup, confirmation, rejection, and blocked generation.

## Testing

Tests will cover source review state transitions, blocked generation before confirmation, successful generation after confirmation, and UI-independent source image listing behavior.
