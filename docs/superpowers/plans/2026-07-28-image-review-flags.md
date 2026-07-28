# Image Review Flags Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let operators mark generated image results as usable, similar, needing regeneration, or delivered.

**Architecture:** Core review normalization keeps task data consistent. The server saves review data on each task. The results library renders review status and sends one-click review updates.

**Tech Stack:** Node.js ESM, built-in `node:test`, vanilla Local Studio frontend, existing task JSON storage.

---

### Task 1: Core Review Model

**Files:**
- Modify: `tools/shopee_local_studio/src/core.js`
- Modify: `tools/shopee_local_studio/test/core.test.js`

- [x] Add failing tests for review normalization and image-result summary review output.
- [x] Implement `normalizeImageReview`.
- [x] Include `imageReview` in `buildImageResultSummary`.
- [x] Run focused image-review tests.

### Task 2: Server Save Endpoint

**Files:**
- Modify: `tools/shopee_local_studio/src/server.js`

- [x] Add `PUT /api/tasks/:id/image-review`.
- [x] Persist normalized review data on the task.
- [x] Append a review log entry.

### Task 3: Frontend Result Review Controls

**Files:**
- Modify: `tools/shopee_local_studio/public/app.js`
- Modify: `tools/shopee_local_studio/public/styles.css`

- [x] Show review status and flags on result cards.
- [x] Add one-click review buttons.
- [x] Refresh result cards after review updates.

### Task 4: Verification And Commit

**Files:**
- All files above

- [x] Run `npm test` in `tools/shopee_local_studio`.
- [x] Run HTTP smoke for `/api/tasks/:id/image-review` and `/api/image-results`.
- [x] Commit with `Add image review flags`.
