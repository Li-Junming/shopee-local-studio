# Source SKU Match Risk Design

## Goal

Show a clear risk level for the 1-store source product match before the user confirms it for AI image generation.

## Design

BigSeller source lookup will store the matched active-list row text in `source-images.json` as `sourceRowText`. Local Studio will evaluate the source match with the task SKU group, source title, source detail, matched SKU group, and row text.

The match result has three levels:

- `strong`: at least one requested SKU appears in visible source evidence such as the row text, source title, or source detail.
- `normal`: BigSeller returned a manifest for the requested SKU group, but the visible source title/detail does not contain a SKU. This is common for buyer-facing titles, so it is not automatically treated as wrong.
- `high`: no requested SKU can be verified from the manifest or visible source evidence.

The source review panel will show this level, the matched SKU evidence, and a short warning. Confirmation remains manual. High-risk sources are not auto-confirmed or auto-used; they remain behind the existing source review safety gate.

## Testing

Tests will cover strong, normal, and high-risk classifications, and verify that BigSeller can normalize matched row text for manifest storage.
