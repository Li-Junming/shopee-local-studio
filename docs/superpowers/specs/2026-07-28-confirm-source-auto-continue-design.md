# Confirm Source Auto Continue Design

## Goal

After the operator confirms the 1-store source product, the one-click workflow should continue automatically instead of requiring another click.

## Scope

- Keep the source confirmation safety step.
- Add a dedicated `confirm-source-and-run` endpoint.
- Keep the existing `confirm-source` endpoint for manual/API use.
- Update the main source confirmation button to call the new endpoint.
- Reuse existing preflight and `runFullPipelineRoute()` behavior.

## Flow

1. Pipeline pauses at 1-store source confirmation.
2. Operator checks source images and clicks confirm.
3. Server confirms the source product.
4. Server immediately runs the existing one-click pipeline route.
5. If runtime or listing blockers remain, the route returns the existing preflight error.

## Non-Goals

- No bypass of source confirmation.
- No automatic confirmation based on SKU evidence.
- No new background queue behavior.

## Testing

- Unit coverage stays on core progress behavior.
- HTTP smoke verifies `confirm-source-and-run` confirms the source and queues the pipeline when preflight allows it.
