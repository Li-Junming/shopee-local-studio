# Preflight Check Design

## Goal

Add a single generation preflight check that summarizes whether a Shopee Local Studio task is ready to generate images or needs attention.

## Design

Local Studio will expose `GET /api/tasks/:id/preflight`. The report combines task metadata, source review state, SKU match risk, store frame status, Vietnamese listing validation, image runtime readiness, and existing generated image count.

The report has four user-facing statuses:

- `ready`: no blockers or high-risk warnings.
- `needs_confirmation`: the task needs 1-store source lookup or source confirmation.
- `high_risk`: generation can run, but there are risk warnings such as high SKU risk, missing store frames, or existing images.
- `blocked`: generation should not run because of invalid listing copy or missing image runtime configuration.

The full pipeline will call preflight before queueing. It will stop on `needs_confirmation` or `blocked`, log the reasons, and return the report to the UI. High-risk warnings remain visible but do not hard-block after the user has confirmed the source.

## Testing

Core tests will cover ready, needs-confirmation, high-risk, and blocked reports. Server smoke tests will verify that `/preflight` returns a report for a task.
