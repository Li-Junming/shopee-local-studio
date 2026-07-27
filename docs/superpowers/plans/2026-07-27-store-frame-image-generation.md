# Store Frame Image Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add automatic target-store watermark/frame references to Shopee image generation for stores 4-9.

**Architecture:** A new store-frame resolver scans the configured local watermark folder and returns one matched frame image per target store. The server passes those matches into `buildImage2Config`, which appends the store-specific frame to that store's `gpt-image-2` edit references and enriches prompts.

**Tech Stack:** Node.js ESM, built-in `node:test`, vanilla Local Studio frontend, existing `gpt-image-2` config format.

---

### Task 1: Store Frame Resolver

**Files:**
- Create: `tools/shopee_local_studio/src/storeFrames.js`
- Create: `tools/shopee_local_studio/test/storeFrames.test.js`

- [x] Add tests that store 7 picks a `水印` image and ignores a `头像` image.
- [x] Add tests that missing store assets are reported without throwing.
- [x] Implement `resolveStoreFrameAssets({ root, storeIds })`.
- [x] Run `node --test test/storeFrames.test.js`.

### Task 2: Image2 Config References

**Files:**
- Modify: `tools/shopee_local_studio/src/core.js`
- Modify: `tools/shopee_local_studio/test/core.test.js`

- [x] Add a failing test that store-specific frame paths are appended only to that store's jobs.
- [x] Add prompt assertions for the target-store watermark/frame instruction.
- [x] Implement `storeFrames` support in `buildImage2Config`.
- [x] Run `npm test -- --test-name-pattern "store frame|buildImage2Config"`.

### Task 3: Server Integration And Status

**Files:**
- Modify: `tools/shopee_local_studio/src/server.js`

- [x] Add `GET /api/store-frames` for UI status.
- [x] Resolve store frames before writing image configs.
- [x] Save `task.storeFrames` metadata and log missing stores.
- [x] Run `npm test` in `tools/shopee_local_studio`.

### Task 4: Frontend Status

**Files:**
- Modify: `tools/shopee_local_studio/public/index.html`
- Modify: `tools/shopee_local_studio/public/app.js`
- Modify: `tools/shopee_local_studio/public/styles.css`

- [x] Add a compact store-frame status line in the task view.
- [x] Load `/api/store-frames` during refresh and render matched/missing stores.
- [x] Keep the UI informational only; missing frames do not disable generation.

### Task 5: Verification And Commit

**Files:**
- All files above

- [x] Run `npm test` in `tools/shopee_local_studio`.
- [x] Run `npm test` in `tools/image2_generator`.
- [x] Run `npm test` in `tools/bigseller_draft_filler`.
- [x] Run HTTP smoke test for `/api/store-frames`.
- [x] Commit with `Add store frame references to image generation`.
