# Product Code Map Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Local Studio UI and API for maintaining the ignored local product-code-to-SKU mapping file.

**Architecture:** Core helpers normalize, list, upsert, and remove mappings. Server endpoints load and save the JSON map. The frontend renders a compact editor panel and refreshes mappings after save/delete.

**Tech Stack:** Node.js ESM, built-in `node:test`, vanilla Local Studio frontend, JSON local config.

---

### Task 1: Core Map Helpers

**Files:**
- Modify: `tools/shopee_local_studio/src/core.js`
- Modify: `tools/shopee_local_studio/test/core.test.js`

- [x] Add failing tests for listing, saving, and deleting mappings.
- [x] Export `listProductCodeMappings`, `upsertProductCodeMapping`, and `removeProductCodeMapping`.
- [x] Run focused product-code tests.

### Task 2: Server Endpoints

**Files:**
- Modify: `tools/shopee_local_studio/src/server.js`

- [x] Add `GET /api/product-code-map`.
- [x] Add `PUT /api/product-code-map/:code`.
- [x] Add `DELETE /api/product-code-map/:code`.
- [x] Save the JSON map to the ignored local map path.

### Task 3: Frontend Panel

**Files:**
- Modify: `tools/shopee_local_studio/public/index.html`
- Modify: `tools/shopee_local_studio/public/app.js`
- Modify: `tools/shopee_local_studio/public/styles.css`

- [x] Add the product-code map panel below task creation.
- [x] Render current mappings and load a selected row into the editor.
- [x] Wire save/delete buttons to the server endpoints.

### Task 4: Verification And Commit

**Files:**
- All files above

- [x] Run `npm test` in `tools/shopee_local_studio`.
- [x] Run HTTP smoke with a temp `PRODUCT_CODE_MAP_PATH`.
- [x] Commit with `Add product code map manager`.
