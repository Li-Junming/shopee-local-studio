# Product Code SKU Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Local Studio accept internal product codes and expand them into BigSeller-searchable SKU groups.

**Architecture:** Add a pure SKU resolution helper in `core.js`. The server reads a local ignored JSON map and applies it during quick parse and task creation. The UI shows the resolved identifier chain so the operator can verify what BigSeller will search.

**Tech Stack:** Node.js ESM, built-in `node:test`, vanilla Local Studio frontend, JSON local config.

---

### Task 1: Core Mapping

**Files:**
- Modify: `tools/shopee_local_studio/src/core.js`
- Modify: `tools/shopee_local_studio/test/core.test.js`

- [x] Add failing tests for expanding product codes, preserving raw SKUs, and searching by original product code.
- [x] Implement `expandProductCodeSkuGroup`.
- [x] Add product-code fields to task search.

### Task 2: Server Integration

**Files:**
- Modify: `tools/shopee_local_studio/src/server.js`
- Create: `tools/shopee_local_studio/product-code-map.example.json`

- [x] Read `PRODUCT_CODE_MAP_PATH` or ignored `data/product-code-map.json`.
- [x] Apply mapping in `/api/parse-task-text` and `POST /api/tasks`.
- [x] Persist product-code mapping metadata on tasks.
- [x] Add an example mapping file without committing real data.

### Task 3: Frontend Display And Verification

**Files:**
- Modify: `tools/shopee_local_studio/public/app.js`

- [x] Show `product code -> SKU group` in task summary and source review.
- [x] Run focused tests.
- [x] Run full Local Studio tests.
- [x] Run HTTP smoke with a temp mapping file.
- [x] Commit with `Add product code SKU mapping`.
