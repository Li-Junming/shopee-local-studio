# Image Review Flags Design

Add manual post-generation review flags to Local Studio image results.

Each task can store an `imageReview` object with a normalized status, flags, optional notes, and timestamp. Supported statuses are `pending`, `approved`, `needs_regeneration`, and `delivered`. Supported flags are `layout_similar`, `color_similar`, `quality_issue`, and `wrong_product`.

The server will expose `PUT /api/tasks/:id/image-review`. Saving a review updates the task JSON and appends a log entry. The existing image results API will include the review summary so the results library can show whether a generated image set is usable, needs regeneration, or has already been delivered.

The frontend results library will render review controls on each result card. Operators can mark a result usable, flag layout/color similarity, mark it for regeneration, or mark it delivered without moving files or changing generation outputs.
