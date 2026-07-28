# One-Click Auto Generation Design

## Goal

Let the operator paste only a product code or SKU and start the automated Shopee image workflow. Store selection and visual design stay automatic.

## Scope

- Default target stores to 4, 5, 6, 7, 8, and 9 when no stores are provided.
- Keep store-specific design automatic through existing store styles, differentiation prompts, and matched store frame images.
- Let `run-all` start even when 1-store source lookup has not happened yet.
- Preserve the safety pause after source lookup if the 1-store product needs confirmation.
- Simplify the quick-entry UI copy around the actual workflow: paste code, start, inspect generated results.

## Flow

1. Operator pastes product code or SKU.
2. Task creation resolves product-code mapping when available.
3. Missing target stores default to stores 4-9.
4. `run-all` starts the background pipeline.
5. Background pipeline fetches 1-store source images.
6. If source confirmation is required, pipeline pauses before image generation.
7. After confirmation, running `run-all` continues image generation and BigSeller steps.

## Non-Goals

- No pre-generation design approval screen.
- No automatic visual similarity scoring.
- No removal of source safety confirmation.
- No change to existing store frame storage.

## Testing

- Unit test default target store normalization.
- Unit test that source lookup not-yet-run does not block starting a pipeline.
- HTTP smoke test creating a task without target stores and confirming it defaults to stores 4-9.
