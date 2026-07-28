# Image Output Archive Design

## Goal

Keep generated image results easy to find by showing only the current version in the result library and download package, while preserving old generated versions.

## Scope

- Before image regeneration, move existing generated PNG files from `images/` to `images-archive/<timestamp>/`.
- Before rerunning the full pipeline on a task that already has generated images, archive the existing generated PNG files the same way.
- Preserve store folder structure inside the archive.
- Keep result library, image preview, and download package reading only from `images/`.

## Directory Shape

```text
task/
  images/
    store_4_skinora_care/01_product.png
  images-archive/
    20260728-101500/
      store_4_skinora_care/01_product.png
```

## Non-Goals

- No automatic deletion of old archive versions.
- No archive browsing UI in this step.
- No change to source image storage.
- No change to task archive/unarchive behavior.

## Testing

- Unit test archive manifest generation.
- Full test suite.
- HTTP/file smoke test that existing images are moved out of `images/` and into `images-archive/`.
