# Confirm Source Auto Continue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Confirming 1-store source should automatically continue the one-click workflow.

**Architecture:** Add one server route that composes `confirmSourceProduct()` with the existing `runFullPipelineRoute()`. Update the frontend confirmation button to use that route and refresh state through existing helpers.

**Tech Stack:** Node.js ESM, browser JavaScript, HTTP smoke verification.

---

### Task 1: Backend Route

**Files:**
- Modify: `tools/shopee_local_studio/src/server.js`

- [ ] **Step 1: Add route**

Add `POST /api/tasks/:id/confirm-source-and-run` next to `confirm-source`.

- [ ] **Step 2: Compose existing functions**

Call `await confirmSourceProduct(task)`, then pass the confirmed task to `runFullPipelineRoute(res, confirmedTask)`.

### Task 2: Frontend Button

**Files:**
- Modify: `tools/shopee_local_studio/public/app.js`

- [ ] **Step 1: Update button text**

Change confirm button copy to `确认并继续`.

- [ ] **Step 2: Update click action**

Change the handler from `confirm-source` to `confirm-source-and-run` with toast `已确认，自动流程继续运行`.

### Task 3: Verify And Commit

**Files:**
- No additional app files beyond Tasks 1-2.

- [ ] **Step 1: Run full tests**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 2: Run HTTP smoke**

Create a temporary task with manual source image and ready runtime environment for the route. Mark it as source-review required, call `confirm-source-and-run`, verify status becomes `pipeline_queued`, then delete the task.

- [ ] **Step 3: Commit**

Run:

```bash
git add docs/superpowers/specs/2026-07-28-confirm-source-auto-continue-design.md docs/superpowers/plans/2026-07-28-confirm-source-auto-continue.md tools/shopee_local_studio/src/server.js tools/shopee_local_studio/public/app.js
git commit -m "Continue pipeline after source confirmation"
```

- [ ] **Step 4: Restart local service**

Restart `tools/shopee_local_studio` on `http://127.0.0.1:3777`.
