# Store Prompt Quality Design

## Goal

Make generated images for stores 4-9 more stable in store-specific style and less overly similar, without adding a strict review system or extra workflow steps.

## Scope

- Strengthen each store profile with stable visual rules for palette, composition, product treatment, benefit style, and background.
- Add lightweight self-check wording to generated prompts: same product is allowed, but composition, background, and benefit hierarchy should not be too similar across target stores.
- Make the four image slots more distinct:
  - `01_product`: clean main product commerce poster.
  - `02_effect`: benefit/result poster with usage feel.
  - `03_real`: natural handheld or vanity real-photo style.
  - `04_real`: alternate real-photo angle and background.
- Keep the existing image generation flow unchanged.

## Non-Goals

- No similarity scoring algorithm.
- No new review page.
- No strict requirement that every store image be completely different.
- No change to model, output size, or file naming.

## Testing

- Unit tests verify prompts include the lightweight self-check.
- Unit tests verify store 4-9 prompts include store-specific stable style anchors.
- Unit tests verify the four image slots include distinct composition instructions.
