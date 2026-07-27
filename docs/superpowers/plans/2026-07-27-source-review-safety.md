# Source Review Safety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require manual confirmation of 1-store source lookup before AI image generation can run.

**Architecture:** Add pure source-review helpers in `core.js`, persist review metadata in `task.json`, block generation paths in `server.js`, and render a source review panel in the existing Local Studio task view.

**Tech Stack:** Node.js ESM, built-in `node:test`, vanilla HTML/CSS/JS, existing Local Studio task JSON storage.

---

### Task 1: Source Review State

**Files:**
- Modify: `tools/shopee_local_studio/src/core.js`
- Modify: `tools/shopee_local_studio/test/core.test.js`

- [x] Add tests for pending, confirmed, and not-required source review states.
- [x] Implement `sourceReviewState(task)` and `assertSourceReviewReady(task)`.
- [x] Run `npm test -- --test-name-pattern "source review"`.

### Task 2: Server Safety Gate

**Files:**
- Modify: `tools/shopee_local_studio/src/server.js`

- [x] Add `POST /api/tasks/:id/source-check`.
- [x] Add `POST /api/tasks/:id/confirm-source`.
- [x] Add `POST /api/tasks/:id/reject-source`.
- [x] Mark BigSeller-fetched source images as requiring confirmation.
- [x] Block image config, image generation, regeneration, and full pipeline before confirmation.

### Task 3: Source Preview API

**Files:**
- Modify: `tools/shopee_local_studio/src/server.js`

- [x] Add `GET /api/tasks/:id/source-images` returning safe source image URLs.
- [x] Add `GET /api/tasks/:id/source-image?file=` with path containment validation.

### Task 4: Frontend Review Panel

**Files:**
- Modify: `tools/shopee_local_studio/public/index.html`
- Modify: `tools/shopee_local_studio/public/app.js`
- Modify: `tools/shopee_local_studio/public/styles.css`

- [x] Add source review panel below task summary.
- [x] Add source lookup, confirm, and reject buttons.
- [x] Render source title, edit link, review state, and source image previews.
- [x] Keep generation controls visible, but backend remains authoritative.

### Task 5: Verification And Commit

**Files:**
- All files above

- [x] Run `npm test` in `tools/shopee_local_studio`.
- [x] Run `npm test` in `tools/image2_generator`.
- [x] Run `npm test` in `tools/bigseller_draft_filler`.
- [x] Run HTTP smoke test for source review status routes.
- [x] Commit with `Add source review safety gate`.
