# Task Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add practical task management so generated Shopee image tasks can be searched, archived, deleted, and downloaded as a package.

**Architecture:** Keep task metadata in each task's existing `task.json`; archiving is a boolean plus timestamp on that task. Server-side listing applies search and archived filters, destructive deletion is constrained to `tools/shopee_local_studio/data/tasks/<taskId>`, and downloads are generated on demand from the task `images/` folder with a small dependency-free ZIP writer.

**Tech Stack:** Node.js ESM, built-in `node:test`, vanilla HTML/CSS/JS, existing Shopee Local Studio server.

---

### Task 1: Search And Archive Metadata

**Files:**
- Modify: `tools/shopee_local_studio/src/core.js`
- Modify: `tools/shopee_local_studio/test/core.test.js`

- [x] Add tests for matching tasks by product name, SKU, status, and store.
- [x] Add tests that archived tasks are hidden unless requested.
- [x] Implement `taskMatchesQuery(task, query)` and `shouldShowTask(task, options)`.
- [x] Run `npm test -- --test-name-pattern "task management"`.

### Task 2: ZIP Download Utility

**Files:**
- Create: `tools/shopee_local_studio/src/zip.js`
- Create: `tools/shopee_local_studio/test/zip.test.js`

- [x] Add tests that a generated ZIP contains expected filenames and ZIP signatures.
- [x] Implement a dependency-free stored ZIP writer with CRC32.
- [x] Run `node --test test/zip.test.js`.

### Task 3: Server APIs

**Files:**
- Modify: `tools/shopee_local_studio/src/server.js`

- [x] Apply query filters to `GET /api/tasks?q=&includeArchived=`.
- [x] Add `POST /api/tasks/:id/archive` and `POST /api/tasks/:id/unarchive`.
- [x] Add `DELETE /api/tasks/:id` with path containment validation.
- [x] Add `GET /api/tasks/:id/download` returning a ZIP of images and listing text.
- [x] Run `npm test` in `tools/shopee_local_studio`.

### Task 4: Frontend Controls

**Files:**
- Modify: `tools/shopee_local_studio/public/index.html`
- Modify: `tools/shopee_local_studio/public/app.js`
- Modify: `tools/shopee_local_studio/public/styles.css`

- [x] Add task search input and "show archived" checkbox.
- [x] Add archive/unarchive, delete, and download buttons.
- [x] Refresh task list with filters and keep selection stable when possible.
- [x] Confirm delete with a browser confirm dialog before calling `DELETE`.

### Task 5: Verification And Commit

**Files:**
- All files above

- [x] Run `npm test` in `tools/shopee_local_studio`.
- [x] Run `npm test` in `tools/image2_generator`.
- [x] Run `npm test` in `tools/bigseller_draft_filler`.
- [x] Review `git diff --stat`.
- [x] Commit with `Add task archive search and download`.
