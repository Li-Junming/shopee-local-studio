# Image Generation Concurrency Design

## Goal

Generate the four images for each target store concurrently while keeping a full 24-image task recoverable when the image API is rate-limited or temporarily unavailable.

## Agreed Behavior

- New Shopee Studio image jobs use a maximum concurrency of 4.
- Jobs remain ordered as four consecutive images per store, so the first four requests start together for the same store.
- Each API request keeps the existing three transient-error attempts.
- If a job still fails with a retryable network, 429, or 5xx error, the scheduler lowers the limit from 4 to 2 and requeues that job once.
- The reduced limit remains active for the rest of the current image run. A new task starts at 4 again.
- Validation errors and other non-retryable failures stop the run immediately.
- A task succeeds only after all configured outputs have been written and postprocessed.

## Components

### Shopee Studio configuration

`buildImage2Config` sets the default maximum concurrency to 4 while preserving an explicit per-task override.

### Image scheduler

The image generator uses an adaptive queue with:

- `maxConcurrency`: initial worker limit, normally 4.
- `fallbackConcurrency`: reduced limit, normally 2.
- A single fallback requeue for a job whose normal request retries were exhausted.
- Clear log messages when concurrency is reduced and when a job is requeued.

Already-running requests are allowed to finish. The scheduler applies the lower limit before starting more queued work.

### API error classification

The existing transient-error classifier becomes reusable by the scheduler. Retryable errors include network failures, HTTP 429, HTTP 500/502/503/504, and known upstream internal errors.

## Failure Handling

- A retryable job gets its existing request retries, followed by one scheduler-level fallback requeue at concurrency 2.
- A second exhausted retryable failure exits non-zero and leaves completed image files in place for resume.
- A non-retryable API response exits immediately without reducing concurrency.
- Existing non-empty files remain resumable unless overwrite mode is explicitly selected.

## Tests

- Shopee Studio creates image configs with default concurrency 4.
- The scheduler initially starts four jobs.
- An exhausted transient failure lowers the scheduler to 2 and requeues the failed job once.
- Non-retryable failures are not requeued.
- Existing image API retry tests and both project test suites continue to pass.

## Scope

This change only affects image request scheduling. It does not reduce the 24-image output, change prompts, alter BigSeller automation, or run a paid live regeneration as part of automated tests.
