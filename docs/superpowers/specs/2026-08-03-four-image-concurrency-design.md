# Four-image concurrency design

## Goal

Generate the four images for a store concurrently so a 24-image, six-store task finishes faster without allowing one transient API failure to discard successful work.

## Scheduling

- Shopee Local Studio writes image jobs in store order, with four consecutive jobs per store.
- New task configs use a maximum concurrency of 4, so the first four active requests belong to the same store.
- The generator keeps a global four-worker pool after that first group, preserving throughput instead of waiting for the slowest image at every store boundary.

## Failure handling

- Each API request keeps the existing three-attempt transient retry policy.
- The first pass processes all pending jobs with concurrency 4 and records failures instead of stopping the pool immediately.
- Jobs that still fail with a retryable network, 429, or 5xx error are retried once more in a fallback pass with concurrency 2.
- Successful outputs are not regenerated during fallback.
- Non-retryable failures are collected and reported after the other jobs finish.
- The command exits successfully only when every requested image has been written and post-processed.

## Configuration

- Studio-generated image configs set `concurrency` to `4` by default.
- They also set `fallbackConcurrency` to `2`.
- Explicit per-task values continue to override these defaults.
- The standalone generator remains compatible with configs that omit `fallbackConcurrency`.

## Verification

- Unit tests prove Studio emits concurrency 4 and fallback concurrency 2.
- Scheduler tests prove peak first-pass concurrency reaches 4.
- Scheduler tests prove only retryable failed jobs enter the two-worker fallback pass.
- Scheduler tests prove permanent failures are reported only after other work settles.
- Existing Studio and image-generator test suites must remain green.
