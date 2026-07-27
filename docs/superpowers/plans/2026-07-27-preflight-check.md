# Preflight Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a task-level preflight report and use it before the full automation pipeline runs.

**Architecture:** A pure `buildPreflightReport` function in Local Studio core classifies task readiness. The server enriches it with runtime, store-frame, and image-count context. The UI renders the report near the task summary.

**Tech Stack:** Node.js ESM, built-in `node:test`, vanilla Local Studio frontend, existing task JSON storage.

---

### Task 1: Core Preflight Report

**Files:**
- Modify: `tools/shopee_local_studio/src/core.js`
- Modify: `tools/shopee_local_studio/test/core.test.js`

- [x] Add tests for `ready`, `needs_confirmation`, `high_risk`, and `blocked`.
- [x] Implement `buildPreflightReport(task, context)`.
- [x] Run `npm test -- --test-name-pattern "preflight"`.

### Task 2: Server API And Pipeline Gate

**Files:**
- Modify: `tools/shopee_local_studio/src/server.js`

- [x] Add `GET /api/tasks/:id/preflight`.
- [x] Build preflight context from runtime, store frames, generated image count, and proxy connectivity.
- [x] Stop `POST /api/tasks/:id/run-all` before queueing when preflight is `blocked` or `needs_confirmation`.
- [x] Log blocked preflight reasons.

### Task 3: Frontend Panel

**Files:**
- Modify: `tools/shopee_local_studio/public/index.html`
- Modify: `tools/shopee_local_studio/public/app.js`
- Modify: `tools/shopee_local_studio/public/styles.css`

- [x] Add a preflight panel below store-frame/source review status.
- [x] Render status, blockers, and warnings.
- [x] Refresh the report with task refreshes and after actions.

### Task 4: Verification And Commit

**Files:**
- All files above

- [x] Run `npm test` in `tools/shopee_local_studio`.
- [x] Run `npm test` in `tools/image2_generator`.
- [x] Run `npm test` in `tools/bigseller_draft_filler`.
- [x] Run HTTP smoke test for `/api/tasks/:id/preflight`.
- [x] Commit with `Add task preflight checks`.
