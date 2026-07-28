# BigSeller Copy Source To Drafts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an explicit automation step that copies a matched 1-store online product to missing 4-9 store Shopee drafts.

**Architecture:** Extend `tools/bigseller_draft_filler` with a `--copy` mode and pure helpers for duplicate planning. Then wire `tools/shopee_local_studio` to write copy config and run the copy mode from a new UI action.

**Tech Stack:** Node.js ESM, `node:test`, Playwright, PowerShell wrapper, vanilla Shopee Local Studio frontend.

---

### Task 1: BigSeller Copy Config And Planning

**Files:**
- Modify: `tools/bigseller_draft_filler/src/config.js`
- Modify: `tools/bigseller_draft_filler/src/fill-drafts.js`
- Modify: `tools/bigseller_draft_filler/test/config.test.js`
- Modify: `tools/bigseller_draft_filler/test/search-mode.test.js`

- [x] **Step 1: Write failing tests**

Add tests for:

```js
parseArgs(["--copy"]).mode === "copy"
loadConfig() accepts copyJobs
buildCopyDraftPlan() returns missing target stores and skipped existing stores
```

- [x] **Step 2: Run target tests**

Run: `npm test` in `tools/bigseller_draft_filler`.

Expected: fail because `--copy`, `copyJobs`, and `buildCopyDraftPlan` do not exist.

- [x] **Step 3: Implement parse/config support**

Add `copyJobs` to config validation and `--copy` to `parseArgs()` / help text.

- [x] **Step 4: Implement pure planning helpers**

Export `rowMatchesSkuAndStore()` and `buildCopyDraftPlan()`.

### Task 2: BigSeller Copy Browser Mode

**Files:**
- Modify: `tools/bigseller_draft_filler/src/fill-drafts.js`
- Modify: `tools/bigseller_draft_filler/run.ps1`

- [x] **Step 1: Add browser helpers**

Add helper functions to click the row copy action, select target stores in the visible copy dialog, and click the dialog confirm button.

- [x] **Step 2: Add copy mode**

Add `copySourceProductsToDrafts(context, config)` that checks existing draft rows, finds the source row, opens the copy dialog, selects missing stores, and confirms.

- [x] **Step 3: Wire CLI and PowerShell**

Call copy mode when `args.mode === "copy"` and add `-Copy` to `run.ps1`.

### Task 3: Shopee Local Studio Integration

**Files:**
- Modify: `tools/shopee_local_studio/src/core.js`
- Modify: `tools/shopee_local_studio/src/server.js`
- Modify: `tools/shopee_local_studio/public/index.html`
- Modify: `tools/shopee_local_studio/public/app.js`
- Modify: `tools/shopee_local_studio/test/core.test.js`

- [x] **Step 1: Write failing core test**

Add `buildBigSellerCopyConfig()` test that verifies stores 4-9 are mapped and `copyJobs[0].sourceStoreMatch === "1店"`.

- [x] **Step 2: Implement core config builder**

Add `buildBigSellerCopyConfig({ productName, skuGroup, targetStores })`.

- [x] **Step 3: Wire server route**

Add task path `bigsellerCopyConfig`, route `POST /api/tasks/:id/copy-source-drafts`, and runner that invokes `run.ps1 -Copy`.

- [x] **Step 4: Add UI button**

Add a button named `复制1店到4-9草稿箱` and wire it to the new action.

### Task 4: Verify And Commit

**Files:**
- No additional production files beyond Tasks 1-3.

- [x] **Step 1: Run full tests**

Run:

```powershell
npm test
```

in both `tools/bigseller_draft_filler` and `tools/shopee_local_studio`.

- [x] **Step 2: Syntax check**

Run:

```powershell
node --check src/fill-drafts.js
node --check public/app.js
```

- [x] **Step 3: Commit**

Run:

```powershell
git add docs/superpowers/specs/2026-07-28-bigseller-copy-source-to-drafts-design.md docs/superpowers/plans/2026-07-28-bigseller-copy-source-to-drafts.md tools/bigseller_draft_filler/src/config.js tools/bigseller_draft_filler/src/fill-drafts.js tools/bigseller_draft_filler/run.ps1 tools/bigseller_draft_filler/test/config.test.js tools/bigseller_draft_filler/test/search-mode.test.js tools/shopee_local_studio/src/core.js tools/shopee_local_studio/src/server.js tools/shopee_local_studio/public/index.html tools/shopee_local_studio/public/app.js tools/shopee_local_studio/test/core.test.js
git commit -m "Copy source listings to target drafts"
```

- [x] **Step 4: Restart local service**

Restart `tools/shopee_local_studio` on `http://127.0.0.1:3777`.
