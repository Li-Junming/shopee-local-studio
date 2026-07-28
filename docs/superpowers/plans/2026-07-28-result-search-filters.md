# Result Search Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add practical search filters for task management, image result library, and current task image previews.

**Architecture:** Put reusable matching logic in `core.js`, call result matching from `server.js` after image summaries are built, and keep selected-task image filtering local in the browser. This follows the existing Node ESM, `node:test`, and static frontend structure.

**Tech Stack:** Node.js ESM, `node:test`, vanilla HTML/CSS/JS.

---

### Task 1: Core Search Helpers

**Files:**
- Modify: `tools/shopee_local_studio/src/core.js`
- Modify: `tools/shopee_local_studio/test/core.test.js`

- [x] **Step 1: Write failing tests**

Add tests for:

```js
imageResultMatchesQuery(result, "store:4 approved layout_similar")
taskImageMatchesQuery(image, "store:4 01_product")
taskMatchesQuery(task, "approved")
```

- [x] **Step 2: Run target tests**

Run: `npm test -- test/core.test.js`

Expected: fail because the new helpers are not exported and task search does not include review status yet.

- [x] **Step 3: Implement helpers**

Add `imageResultMatchesQuery(result, query)` and `taskImageMatchesQuery(image, query)`. Extend `taskMatchesQuery()` with normalized image review status and flags.

- [x] **Step 4: Run target tests**

Run: `npm test -- test/core.test.js`

Expected: pass.

### Task 2: Server Result Search

**Files:**
- Modify: `tools/shopee_local_studio/src/server.js`

- [x] **Step 1: Import result matching helper**

Import `imageResultMatchesQuery` from `core.js`.

- [x] **Step 2: Filter image results after summary build**

Change `listImageResults(options)` so it applies archive filtering at task level, builds `buildImageResultSummary(task, images)`, then applies `imageResultMatchesQuery(summary, options.query)`.

- [x] **Step 3: Run target tests**

Run: `npm test -- test/core.test.js`

Expected: pass.

### Task 3: Current Task Image Filter UI

**Files:**
- Modify: `tools/shopee_local_studio/public/index.html`
- Modify: `tools/shopee_local_studio/public/app.js`
- Modify: `tools/shopee_local_studio/public/styles.css`

- [x] **Step 1: Add preview filter input**

Add `<input id="taskImageSearch" type="search">` beside the reload images button.

- [x] **Step 2: Store loaded task images in state**

Add a `taskImages` array and render filtered images without re-fetching on every keystroke.

- [x] **Step 3: Add browser-side matching**

Add a small `taskImageMatchesSearch(image, query)` function mirroring the tested server helper fields.

- [x] **Step 4: Add compact styling**

Keep the filter aligned with existing section controls and avoid widening the panel.

### Task 4: Verify And Commit

**Files:**
- No new production files beyond Tasks 1-3.

- [x] **Step 1: Run full tests**

Run: `npm test`

Expected: all tests pass.

- [x] **Step 2: Run HTTP smoke check**

Start the local server on a temporary port, create a task with one current image and approved review state, call `/api/image-results?q=approved`, then delete the task.

- [x] **Step 3: Commit**

Run:

```bash
git add docs/superpowers/specs/2026-07-28-result-search-filters-design.md docs/superpowers/plans/2026-07-28-result-search-filters.md tools/shopee_local_studio/src/core.js tools/shopee_local_studio/src/server.js tools/shopee_local_studio/test/core.test.js tools/shopee_local_studio/public/index.html tools/shopee_local_studio/public/app.js tools/shopee_local_studio/public/styles.css
git commit -m "Add result search filters"
```

- [x] **Step 4: Restart local service**

Restart `tools/shopee_local_studio` on `http://127.0.0.1:3777`.
