# BigSeller Draft Filler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local helper that fills one or more BigSeller Shopee draft edit pages and clicks only the white Save button.

**Architecture:** Keep store matching and asset loading in small testable modules, and keep browser automation in one CLI script. The CLI reads `jobs.json`, opens a persistent Playwright Chrome session, matches the edit page store name to `store_7`, `store_8`, or `store_9`, uploads PNG images, fills title/detail, and saves the draft.

**Tech Stack:** Node.js 24, built-in `node:test`, Playwright for browser automation.

---

### Task 1: Local Matching And Assets

**Files:**
- Create: `tools/bigseller_draft_filler/package.json`
- Create: `tools/bigseller_draft_filler/src/stores.js`
- Create: `tools/bigseller_draft_filler/src/assets.js`
- Create: `tools/bigseller_draft_filler/test/stores.test.js`
- Create: `tools/bigseller_draft_filler/test/assets.test.js`

- [ ] Write tests for store-name matching and asset folder validation.
- [ ] Run tests and confirm they fail because modules are missing.
- [ ] Implement `identifyStore()` and `loadStoreAssets()`.
- [ ] Run tests and confirm they pass.

### Task 2: Browser Automation CLI

**Files:**
- Create: `tools/bigseller_draft_filler/src/fill-drafts.js`
- Create: `tools/bigseller_draft_filler/jobs.example.json`
- Create: `tools/bigseller_draft_filler/run.ps1`
- Create: `tools/bigseller_draft_filler/README.md`

- [ ] Add a CLI that reads jobs and opens a persistent Chrome window.
- [ ] Detect the current edit page store name from visible text.
- [ ] Fill the first product title input and product description textarea.
- [ ] Upload PNG files through the product image file input.
- [ ] Click only the white `保存` button and never click `保存&发布`.
- [ ] Document login, dry-run, and run commands.

### Task 3: Verification

**Files:**
- Modify: `tools/bigseller_draft_filler/README.md`

- [ ] Run `npm test`.
- [ ] Run `node src/fill-drafts.js --help`.
- [ ] Confirm the tool defaults to dry-run unless `--save` is passed.
- [ ] Confirm generated output paths and configuration format are documented.
