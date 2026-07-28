# Store Prompt Quality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve store-specific image prompt stability and reduce overly similar outputs without adding workflow complexity.

**Architecture:** Keep all behavior in `tools/shopee_local_studio/src/core.js` prompt construction. Add tests in `tools/shopee_local_studio/test/core.test.js` so the store style anchors, self-check wording, and image-slot distinctions stay stable.

**Tech Stack:** Node.js ESM and `node:test`.

---

### Task 1: Prompt Coverage Tests

**Files:**
- Modify: `tools/shopee_local_studio/test/core.test.js`

- [x] **Step 1: Add failing tests**

Add tests that build an image2 config for stores 4-9 and assert:

```js
assert.match(prompt, /Light self-check/);
assert.match(store4Prompt, /warm daily-care shelf/);
assert.match(store5Prompt, /fresh water-light diagonal/);
assert.match(store6Prompt, /premium layered hero/);
assert.match(store7Prompt, /pink-gold beauty counter/);
assert.match(store8Prompt, /clinical blue grid/);
assert.match(store9Prompt, /red conversion hero/);
```

Add a test that checks `01_product`, `02_effect`, `03_real`, and `04_real` each contain a distinct slot role.

- [x] **Step 2: Run target tests**

Run: `npm test -- test/core.test.js`

Expected: fail because the stronger prompt anchors are not present yet.

### Task 2: Prompt Implementation

**Files:**
- Modify: `tools/shopee_local_studio/src/core.js`

- [x] **Step 1: Strengthen store profiles**

Expand `STORE_DIFFERENTIATION_BY_ID` with stable store-specific composition and background anchors.

- [x] **Step 2: Add lightweight self-check**

Add wording to `storeDifferentiationPrompt()` so generated prompts ask for a self-check against excessive similarity without requiring completely different outputs.

- [x] **Step 3: Strengthen image slot prompts**

Update `productPosterPrompt()`, `effectPosterPrompt()`, and `realPhotoPrompt()` with distinct slot-role wording.

- [x] **Step 4: Run target tests**

Run: `npm test -- test/core.test.js`

Expected: pass.

### Task 3: Verify And Commit

**Files:**
- No additional production files beyond Task 2.

- [x] **Step 1: Run full tests**

Run: `npm test`

Expected: all tests pass.

- [x] **Step 2: Inspect sample prompt output**

Run a small Node script that builds a config for stores 4-9 and prints one prompt per store. Confirm the anchors are present.

- [x] **Step 3: Commit**

Run:

```bash
git add docs/superpowers/specs/2026-07-28-store-prompt-quality-design.md docs/superpowers/plans/2026-07-28-store-prompt-quality.md tools/shopee_local_studio/src/core.js tools/shopee_local_studio/test/core.test.js
git commit -m "Improve store image prompts"
```

- [x] **Step 4: Restart local service**

Restart `tools/shopee_local_studio` on `http://127.0.0.1:3777`.
