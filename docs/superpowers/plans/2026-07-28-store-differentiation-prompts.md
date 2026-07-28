# Store Differentiation Prompts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make each store's generated images use distinct visual direction for the same product.

**Architecture:** Add store-level visual profiles in `core.js`, inject those profiles into every image prompt, and add sibling-store anti-reuse instructions when a task targets multiple stores.

**Tech Stack:** Node.js ESM, built-in `node:test`, existing image2 job config generation.

---

### Task 1: Prompt Tests

**Files:**
- Modify: `tools/shopee_local_studio/test/core.test.js`

- [x] Add a failing test that stores 4, 5, and 6 receive distinct visual profiles.
- [x] Add a failing test that each selected store avoids reusing sibling store layout.
- [x] Run focused prompt tests and confirm they fail before implementation.

### Task 2: Prompt Implementation

**Files:**
- Modify: `tools/shopee_local_studio/src/core.js`

- [x] Add `STORE_DIFFERENTIATION_BY_ID`.
- [x] Add `storeDifferentiationPrompt(store, siblingStores)`.
- [x] Inject store differentiation into product, effect, and real-photo prompts.
- [x] Run focused prompt tests and confirm they pass.

### Task 3: Verification And Commit

**Files:**
- All files above

- [x] Run `npm test` in `tools/shopee_local_studio`.
- [x] Run HTTP smoke for `/api/tasks/:id/image2-config` and inspect generated prompts.
- [x] Commit with `Add store differentiation prompts`.
