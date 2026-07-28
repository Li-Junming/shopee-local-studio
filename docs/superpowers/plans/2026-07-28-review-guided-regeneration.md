# Review-Guided Regeneration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make image regeneration respond to manual review reasons.

**Architecture:** Keep review data on the existing task record. Feed that data into `buildImage2Config()` and append compact regeneration instructions to every prompt. Add one result-card button that calls the existing regeneration API.

**Tech Stack:** Node.js ESM, `node:test`, local HTTP server, browser frontend JavaScript.

---

### Task 1: Prompt Contract

**Files:**
- Modify: `tools/shopee_local_studio/test/core.test.js`
- Modify: `tools/shopee_local_studio/src/core.js`

- [ ] **Step 1: Write the failing test**

Add a test named `buildImage2Config adds review-guided regeneration instructions` that builds config with `imageReview.status = "needs_regeneration"`, `layout_similar`, `color_similar`, and notes. Assert the store 4 product prompt includes `Review-guided regeneration`, `Change the composition`, `Change the palette`, and the notes.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- test/core.test.js`
Expected: FAIL because current prompts do not include review-guided text.

- [ ] **Step 3: Implement prompt guidance**

Add a helper in `src/core.js` that normalizes `task.imageReview` and returns concise prompt instructions for flags and notes. Append it to `basePrompt()` and `realPhotoPrompt()`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- test/core.test.js`
Expected: PASS.

### Task 2: Server Wiring And Result Action

**Files:**
- Modify: `tools/shopee_local_studio/src/server.js`
- Modify: `tools/shopee_local_studio/public/app.js`

- [ ] **Step 1: Pass review data into image2 config**

Add `imageReview: task.imageReview` to the `buildImage2Config()` call in `writeImage2Config()`.

- [ ] **Step 2: Add result-card regenerate action**

Add a `重生` button to `.result-actions` and wire it to `POST /api/tasks/:id/regenerate-images`. Refresh tasks and results after the call.

- [ ] **Step 3: Run full tests**

Run: `npm test`
Expected: all tests pass.

### Task 3: Smoke Verification And Commit

**Files:**
- No persistent app files beyond Tasks 1-2.

- [ ] **Step 1: Run HTTP smoke**

Start the local studio on a temporary port, create a task, save review flags, generate image2 config, and assert the written prompt includes review-guided text.

- [ ] **Step 2: Commit**

Run:

```bash
git add docs/superpowers/specs/2026-07-28-review-guided-regeneration-design.md docs/superpowers/plans/2026-07-28-review-guided-regeneration.md tools/shopee_local_studio/src/core.js tools/shopee_local_studio/src/server.js tools/shopee_local_studio/public/app.js tools/shopee_local_studio/test/core.test.js
git commit -m "Add review-guided regeneration"
```

- [ ] **Step 3: Restart local service**

Restart `tools/shopee_local_studio` on `http://127.0.0.1:3777`.
