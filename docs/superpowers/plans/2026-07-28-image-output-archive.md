# Image Output Archive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Archive old generated images before regeneration or full rerun so current results stay clean.

**Architecture:** Add a pure archive manifest helper in `core.js`, then use it from `server.js` to move PNG files from `images/` to `images-archive/<timestamp>/`. Existing result and download code already reads only `images/`, so it naturally stays on the current version.

**Tech Stack:** Node.js ESM, `node:test`, local filesystem.

---

### Task 1: Archive Manifest

**Files:**
- Modify: `tools/shopee_local_studio/src/core.js`
- Modify: `tools/shopee_local_studio/test/core.test.js`

- [x] **Step 1: Write failing test**

Add a test for `buildImageArchiveManifest(task, images, "20260728-101500")` that verifies:

- `archiveDir` is under `task.paths.taskDir/images-archive/20260728-101500`
- entries preserve `store_x/file.png`
- unsafe relative paths throw

- [x] **Step 2: Run target tests**

Run: `npm test -- test/core.test.js`
Expected: FAIL because `buildImageArchiveManifest` does not exist.

- [x] **Step 3: Implement helper**

Return `{ archiveId, archiveDir, count, entries }`, with each entry containing `{ file, from, to }`.

### Task 2: Server Archive Move

**Files:**
- Modify: `tools/shopee_local_studio/src/server.js`

- [x] **Step 1: Add `archiveCurrentImages(task, reason)`**

Use `listImages(task)` and `buildImageArchiveManifest()` to move files with `fs.rename()`, creating target folders first.

- [x] **Step 2: Call before regeneration**

Call it in `runImage2()` when `options.overwrite` is true.

- [x] **Step 3: Call before full pipeline rerun**

In `runPipelineInBackground()`, before writing image2 config, archive existing current images if any exist.

### Task 3: Verify And Commit

**Files:**
- No additional app files beyond Tasks 1-2.

- [x] **Step 1: Run full tests**

Run: `npm test`
Expected: all tests pass.

- [x] **Step 2: Run file smoke**

Create a temporary task with a fake current PNG, call the archive helper through a temporary server route action or direct module script, and verify:

- current `images/store_x/file.png` is gone
- archive file exists
- `listImages` no longer sees archived files

- [x] **Step 3: Commit**

Run:

```bash
git add docs/superpowers/specs/2026-07-28-image-output-archive-design.md docs/superpowers/plans/2026-07-28-image-output-archive.md tools/shopee_local_studio/src/core.js tools/shopee_local_studio/src/server.js tools/shopee_local_studio/test/core.test.js
git commit -m "Archive previous generated images"
```

- [x] **Step 4: Restart local service**

Restart `tools/shopee_local_studio` on `http://127.0.0.1:3777`.
