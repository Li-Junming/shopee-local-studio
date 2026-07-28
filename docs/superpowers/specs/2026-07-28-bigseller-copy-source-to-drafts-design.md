# BigSeller Copy Source To Drafts Design

## Goal

Automatically copy the matched 1-store online Shopee product into target-store BigSeller draft boxes for stores 4-9.

## Scope

- Add a BigSeller automation mode that:
  - searches the 1-store active listing by SKU group,
  - opens the "copy to Shopee draft" dialog from the matched row,
  - selects only target stores that do not already have a matching draft,
  - confirms the copy dialog.
- Add a Shopee Local Studio action button for this copy step.
- Keep existing image generation, draft discovery, image upload, and draft save behavior unchanged.

## Duplicate Control

Before copying, the automation checks the Shopee draft list for each target store. If a row already contains one requested SKU and the target store name, that store is skipped. Only missing target stores are selected in the copy dialog.

## Non-Goals

- No publishing.
- No automatic editing of the copied drafts in this step.
- No strict source evidence report.
- No automatic deletion of duplicate drafts that already exist.

## Testing

- Unit test copy-mode argument parsing and config validation.
- Unit test target-store copy planning from existing draft rows.
- Unit test Shopee Local Studio copy config generation.
- Run full tests for both `bigseller_draft_filler` and `shopee_local_studio`.
