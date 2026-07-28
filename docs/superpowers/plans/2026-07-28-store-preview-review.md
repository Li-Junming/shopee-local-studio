# Store Preview Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show generated images grouped by store so manual review is faster.

**Architecture:** Extend the existing image result summary with `storePreviewGroups` derived from the images already returned by `listImages()`. Render those groups in the result card before falling back to the old flat preview list. This preserves the current API shape and actions while adding a better review layout.

**Tech Stack:** Node.js ESM, `node:test`, browser JavaScript, CSS.

---

### Task 1: Summary Grouping

**Files:**
- Modify: `tools/shopee_local_studio/test/core.test.js`
- Modify: `tools/shopee_local_studio/src/core.js`

- [ ] **Step 1: Write the failing test**

Add assertions to `buildImageResultSummary counts images by store and keeps first previews`:

```js
assert.deepEqual(summary.storePreviewGroups.map((group) => ({
  store: group.store,
  storeLabel: group.storeLabel,
  count: group.count,
  files: group.previewImages.map((image) => image.file)
})), [
  { store: "7", storeLabel: "Store 7", count: 2, files: ["store_7/01.png", "store_7/02.png"] },
  { store: "9", storeLabel: "Store 9", count: 3, files: ["store_9/01.png", "store_9/02.png", "store_9/03.png"] }
]);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/core.test.js`
Expected: FAIL because `storePreviewGroups` does not exist yet.

- [ ] **Step 3: Implement grouping**

In `buildImageResultSummary()`, build `storePreviewGroups` from images grouped by store, sorted by store id, with `count` and up to four `previewImages`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- test/core.test.js`
Expected: PASS.

### Task 2: Frontend Grouped Preview

**Files:**
- Modify: `tools/shopee_local_studio/public/app.js`
- Modify: `tools/shopee_local_studio/public/styles.css`

- [ ] **Step 1: Render grouped previews**

Add `renderStorePreviewGroups(result)` and call it inside each result card. If groups are empty, keep the existing flat preview rendering.

- [ ] **Step 2: Style grouped previews**

Add CSS for `.store-preview-groups`, `.store-preview-group`, `.store-preview-title`, and grouped thumbnails. Use compact grids so 4-9 stores remain scannable.

### Task 3: Verify And Commit

**Files:**
- No additional app files beyond Tasks 1-2.

- [ ] **Step 1: Run full tests**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 2: Run HTTP smoke**

Create a temporary task, write placeholder PNG files into two store image folders, call `/api/image-results`, and verify `storePreviewGroups` includes both stores.

- [ ] **Step 3: Commit**

Run:

```bash
git add docs/superpowers/specs/2026-07-28-store-preview-review-design.md docs/superpowers/plans/2026-07-28-store-preview-review.md tools/shopee_local_studio/src/core.js tools/shopee_local_studio/public/app.js tools/shopee_local_studio/public/styles.css tools/shopee_local_studio/test/core.test.js
git commit -m "Add grouped store result previews"
```

- [ ] **Step 4: Restart local service**

Restart `tools/shopee_local_studio` on `http://127.0.0.1:3777`.
