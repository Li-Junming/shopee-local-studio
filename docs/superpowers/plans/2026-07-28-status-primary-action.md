# Status Primary Action Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a recommended action button to the current workflow status panel.

**Architecture:** `buildTaskProgress()` returns a `primaryAction` object. The frontend renders one button and dispatches it through existing `postTaskAction()` or download helpers.

**Tech Stack:** Node.js ESM, `node:test`, browser JavaScript, CSS.

---

### Task 1: Progress Actions

**Files:**
- Modify: `tools/shopee_local_studio/src/core.js`
- Modify: `tools/shopee_local_studio/test/core.test.js`

- [ ] **Step 1: Write failing tests**

Assert:

```js
buildTaskProgress(sourcePending).primaryAction.action === "confirm-source-and-run"
buildTaskProgress(readyTask, { preflight: { status: "ready" } }).primaryAction.action === "run-all"
buildTaskProgress({ status: "pipeline_done" }).primaryAction.action === "download"
buildTaskProgress({ status: "image2_failed" }).primaryAction.action === "regenerate-images"
```

- [ ] **Step 2: Run target tests**

Run: `npm test -- test/core.test.js`
Expected: FAIL because `primaryAction` is not returned yet.

- [ ] **Step 3: Implement primary actions**

Add optional fifth argument to local `progress()` helper and return `{ stage, level, label, message, nextAction, primaryAction }`.

- [ ] **Step 4: Run target tests**

Run: `npm test -- test/core.test.js`
Expected: PASS.

### Task 2: Frontend Button

**Files:**
- Modify: `tools/shopee_local_studio/public/app.js`
- Modify: `tools/shopee_local_studio/public/styles.css`

- [ ] **Step 1: Render button**

In `renderPipelineProgress()`, render `progress.primaryAction` as `button[data-progress-action]` when present.

- [ ] **Step 2: Wire action**

Add `runProgressAction(action)`:

- `download` calls `downloadSelectedTask()`.
- Other actions call `postTaskAction(action.action, action.toast || default)`.

- [ ] **Step 3: Style button**

Add `.pipeline-progress-action` styles.

### Task 3: Verify And Commit

**Files:**
- No additional app files beyond Tasks 1-2.

- [ ] **Step 1: Run full tests**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 2: Run HTTP smoke**

Create a temporary task, call `/preflight`, and verify `progress.primaryAction.action` exists.

- [ ] **Step 3: Commit**

Run:

```bash
git add docs/superpowers/specs/2026-07-28-status-primary-action-design.md docs/superpowers/plans/2026-07-28-status-primary-action.md tools/shopee_local_studio/src/core.js tools/shopee_local_studio/public/app.js tools/shopee_local_studio/public/styles.css tools/shopee_local_studio/test/core.test.js
git commit -m "Add primary workflow action"
```

- [ ] **Step 4: Restart local service**

Restart `tools/shopee_local_studio` on `http://127.0.0.1:3777`.
