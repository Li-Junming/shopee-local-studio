# One-Click Auto Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make product code or SKU enough to start the automated Shopee image workflow.

**Architecture:** Add core helpers for default target stores and pipeline-start blocking rules. Use those helpers in the server task creation and `run-all` route. Update frontend text only; no new screen or design approval step.

**Tech Stack:** Node.js ESM, `node:test`, browser JavaScript/HTML.

---

### Task 1: Core Defaults And Pipeline Gate

**Files:**
- Modify: `tools/shopee_local_studio/src/core.js`
- Modify: `tools/shopee_local_studio/test/core.test.js`

- [ ] **Step 1: Write failing tests**

Add tests for:

```js
assert.deepEqual(resolveTargetStoreIds([]), ["4", "5", "6", "7", "8", "9"]);
assert.deepEqual(resolveTargetStoreIds(["5", "9"]), ["5", "9"]);
```

And for:

```js
const report = buildPreflightReport(taskWithoutSourceImages, readyContext);
assert.deepEqual(pipelineStartBlockers(report), []);
```

- [ ] **Step 2: Run target tests**

Run: `npm test -- test/core.test.js`
Expected: FAIL because helpers do not exist.

- [ ] **Step 3: Implement helpers**

Add:

- `DEFAULT_TARGET_STORE_IDS`
- `resolveTargetStoreIds(input)`
- `pipelineStartBlockers(preflight)`

`pipelineStartBlockers()` should ignore only `source_lookup_needed`; it must keep runtime, invalid listing, source confirmation, and other blockers.

- [ ] **Step 4: Run target tests**

Run: `npm test -- test/core.test.js`
Expected: PASS.

### Task 2: Server Wiring

**Files:**
- Modify: `tools/shopee_local_studio/src/server.js`

- [ ] **Step 1: Use default target stores**

Use `resolveTargetStoreIds(body.targetStores)` in `createTask()`.

- [ ] **Step 2: Let run-all start source lookup**

Use `pipelineStartBlockers(preflight)` in `runFullPipelineRoute()`. Return 409 only when those blockers remain.

### Task 3: UI Copy

**Files:**
- Modify: `tools/shopee_local_studio/public/index.html`
- Modify: `tools/shopee_local_studio/public/app.js`

- [ ] **Step 1: Simplify quick-entry copy**

Change placeholder and hint to say paste product code/SKU and start automatic generation. Mention stores 4-9 are automatic.

- [ ] **Step 2: Update toast copy**

Make parse/create-run messages shorter and aligned with one-click flow.

### Task 4: Verify And Commit

**Files:**
- No additional app files beyond Tasks 1-3.

- [ ] **Step 1: Run full tests**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 2: Run HTTP smoke**

Create a task without `targetStores`; verify returned `targetStores` is `["4","5","6","7","8","9"]`. Delete the task.

- [ ] **Step 3: Commit**

Run:

```bash
git add docs/superpowers/specs/2026-07-28-one-click-auto-generation-design.md docs/superpowers/plans/2026-07-28-one-click-auto-generation.md tools/shopee_local_studio/src/core.js tools/shopee_local_studio/src/server.js tools/shopee_local_studio/public/index.html tools/shopee_local_studio/public/app.js tools/shopee_local_studio/test/core.test.js
git commit -m "Simplify one-click auto generation"
```

- [ ] **Step 4: Restart local service**

Restart `tools/shopee_local_studio` on `http://127.0.0.1:3777`.
