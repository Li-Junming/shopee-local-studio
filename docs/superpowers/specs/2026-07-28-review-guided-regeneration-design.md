# Review-Guided Regeneration Design

## Goal

When a generated image result is marked as needing regeneration, the next image2 config should carry the review reason into every generated prompt. This makes regeneration intentional instead of another random version.

## Scope

- Reuse the existing `imageReview` object on each task.
- Add prompt guidance for the current flags:
  - `layout_similar`: change composition, crop, placement, and benefit hierarchy.
  - `color_similar`: change palette balance, lighting, and accent usage while staying inside the store profile.
  - `quality_issue`: improve readability, product clarity, polish, and ecommerce finish.
  - `wrong_product`: prioritize source product identity and packaging.
- Preserve existing store differentiation prompts for stores 4-9.
- Add a direct regenerate action on each result card so reviewed results can be regenerated without first opening the task.

## Data Flow

1. The operator marks a result in the image results library.
2. `PUT /api/tasks/:id/image-review` saves normalized review status, flags, notes, and timestamp.
3. `POST /api/tasks/:id/regenerate-images` rewrites image2 config.
4. `writeImage2Config()` passes task `imageReview` into `buildImage2Config()`.
5. `buildImage2Config()` appends review-guided instructions to product, effect, and real-photo jobs.

## Non-Goals

- No automatic visual similarity scoring in this step.
- No per-image flagging yet; review stays task-level.
- No changes to image2 runtime or output folder structure.

## Testing

- Unit test that `buildImage2Config()` includes review-guided regeneration text when review flags and notes exist.
- HTTP smoke test that saved review flags reach the generated image2 config.
