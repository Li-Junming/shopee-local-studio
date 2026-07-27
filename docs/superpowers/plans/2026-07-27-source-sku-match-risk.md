# Source SKU Match Risk Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add SKU match strength/risk evidence to the 1-store source review flow.

**Architecture:** Add a pure risk evaluator in Local Studio core, persist the result on tasks when source lookup finishes, enrich the source review API response, and store matched BigSeller row text in the source manifest.

**Tech Stack:** Node.js ESM, built-in `node:test`, vanilla Local Studio frontend, existing BigSeller Playwright source mode.

---

### Task 1: Core Risk Evaluator

**Files:**
- Modify: `tools/shopee_local_studio/src/core.js`
- Modify: `tools/shopee_local_studio/test/core.test.js`

- [x] Add tests for `strong`, `normal`, and `high` source SKU match risk.
- [x] Implement `sourceSkuMatchRisk(task)`.
- [x] Include risk in `sourceReviewState(task)`.
- [x] Run `npm test -- --test-name-pattern "source SKU match"`.

### Task 2: BigSeller Row Evidence

**Files:**
- Modify: `tools/bigseller_draft_filler/src/fill-drafts.js`
- Modify: `tools/bigseller_draft_filler/test/fill-drafts.test.js`

- [x] Add a test for row text normalization.
- [x] Implement `normalizeSourceRowText(text)`.
- [x] Store `sourceRowText` in `source-images.json`.
- [x] Run `npm test` in `tools/bigseller_draft_filler`.

### Task 3: Server Persistence

**Files:**
- Modify: `tools/shopee_local_studio/src/server.js`

- [x] Read `sourceRowText` from BigSeller manifest.
- [x] Store `sourceMatchRisk` on task after lookup.
- [x] Log high-risk and normal-risk source evidence.
- [x] Return risk through `/api/tasks/:id/source-images`.

### Task 4: Frontend Risk Display

**Files:**
- Modify: `tools/shopee_local_studio/public/app.js`
- Modify: `tools/shopee_local_studio/public/styles.css`

- [x] Show risk badge in source review panel.
- [x] Show matched SKU evidence and warning text.
- [x] Style high risk visibly without hiding confirm controls.

### Task 5: Verification And Commit

**Files:**
- All files above

- [x] Run `npm test` in `tools/shopee_local_studio`.
- [x] Run `npm test` in `tools/image2_generator`.
- [x] Run `npm test` in `tools/bigseller_draft_filler`.
- [x] Run HTTP smoke test for source review response shape.
- [x] Commit with `Add source SKU match risk checks`.
