# Pipeline Status Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a clear workflow progress panel for one-click generation.

**Architecture:** Add a pure `buildTaskProgress()` helper in `core.js`, return it from the existing preflight API, and render it in the frontend above detailed checks. The helper derives state from existing task fields and preflight results.

**Tech Stack:** Node.js ESM, `node:test`, browser JavaScript, CSS.

---

### Task 1: Progress Mapping

**Files:**
- Modify: `tools/shopee_local_studio/src/core.js`
- Modify: `tools/shopee_local_studio/test/core.test.js`

- [ ] **Step 1: Write failing tests**

Add tests for:

```js
buildTaskProgress({ status: "source_review_required", sourceReviewRequired: true, sourceImages: ["x"] }).stage === "source_review"
buildTaskProgress({ status: "pipeline_generating_images" }).stage === "image_generation"
buildTaskProgress({ status: "pipeline_done" }).stage === "done"
buildTaskProgress({ status: "pipeline_failed" }, { preflight: { blockers: [{ message: "missing key" }] } }).level === "error"
```

- [ ] **Step 2: Run target tests**

Run: `npm test -- test/core.test.js`
Expected: FAIL because `buildTaskProgress` does not exist.

- [ ] **Step 3: Implement helper**

Return `{ stage, level, label, message, nextAction }` using existing task/preflight state.

- [ ] **Step 4: Run target tests**

Run: `npm test -- test/core.test.js`
Expected: PASS.

### Task 2: API And Frontend

**Files:**
- Modify: `tools/shopee_local_studio/src/server.js`
- Modify: `tools/shopee_local_studio/public/index.html`
- Modify: `tools/shopee_local_studio/public/app.js`
- Modify: `tools/shopee_local_studio/public/styles.css`

- [ ] **Step 1: Return progress from preflight API**

Change `/api/tasks/:id/preflight` to return `{ preflight, progress }`.

- [ ] **Step 2: Add progress panel markup**

Add `<div id="pipelineProgressPanel" class="pipeline-progress"></div>` above the preflight panel.

- [ ] **Step 3: Render progress**

In `renderPreflight()`, render `data.progress` into the progress panel before rendering detailed preflight items.

- [ ] **Step 4: Style progress**

Add compact styles for `.pipeline-progress`, levels, and next action text.

### Task 3: Verify And Commit

**Files:**
- No additional app files beyond Tasks 1-2.

- [ ] **Step 1: Run full tests**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 2: Run HTTP smoke**

Create a temporary task and call `/api/tasks/:id/preflight`; verify `progress.stage` and `progress.nextAction` exist.

- [ ] **Step 3: Commit**

Run:

```bash
git add docs/superpowers/specs/2026-07-28-pipeline-status-panel-design.md docs/superpowers/plans/2026-07-28-pipeline-status-panel.md tools/shopee_local_studio/src/core.js tools/shopee_local_studio/src/server.js tools/shopee_local_studio/public/index.html tools/shopee_local_studio/public/app.js tools/shopee_local_studio/public/styles.css tools/shopee_local_studio/test/core.test.js
git commit -m "Add pipeline status panel"
```

- [ ] **Step 4: Restart local service**

Restart `tools/shopee_local_studio` on `http://127.0.0.1:3777`.
