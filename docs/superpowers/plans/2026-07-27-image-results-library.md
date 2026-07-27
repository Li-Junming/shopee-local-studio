# Image Results Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a searchable Local Studio results view for generated task images.

**Architecture:** A pure core helper builds image-result summaries from task metadata and image lists. The server scans existing tasks and serves result summaries through `/api/image-results`. The frontend renders a compact result library with previews and task actions.

**Tech Stack:** Node.js ESM, built-in `node:test`, vanilla Local Studio frontend, existing task JSON/image folder storage.

---

### Task 1: Core Result Summary

**Files:**
- Modify: `tools/shopee_local_studio/src/core.js`
- Modify: `tools/shopee_local_studio/test/core.test.js`

- [x] Add a failing test for image result summary counts, preview truncation, and identifier text.
- [x] Implement `buildImageResultSummary(task, images)`.
- [x] Run focused image-result tests.

### Task 2: Results API

**Files:**
- Modify: `tools/shopee_local_studio/src/server.js`

- [x] Add `GET /api/image-results`.
- [x] Include only tasks with generated images.
- [x] Reuse task search and archive filters.
- [x] Return summaries sorted by newest update time.

### Task 3: Frontend Results Library

**Files:**
- Modify: `tools/shopee_local_studio/public/index.html`
- Modify: `tools/shopee_local_studio/public/app.js`
- Modify: `tools/shopee_local_studio/public/styles.css`

- [x] Add image-result search controls and container.
- [x] Render previews, counts, timestamps, and status.
- [x] Wire select/open, download, and archive/unarchive actions.

### Task 4: Verification And Commit

**Files:**
- All files above

- [x] Run `npm test` in `tools/shopee_local_studio`.
- [x] Run HTTP smoke for `/api/image-results` with a temporary task image.
- [x] Commit with `Add image results library`.
