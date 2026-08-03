# Adaptive Image Concurrency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Start each store's four image jobs concurrently and automatically reduce new request concurrency to two after an exhausted transient API failure, without changing image quality or output count.

**Architecture:** Add a focused adaptive queue module to `image2_generator`, reuse the image client's transient-error classifier, and connect the queue to the existing CLI. Shopee Studio will emit concurrency `4` by default; prompts, model, quality, references, postprocessing, and the 24-job structure remain unchanged.

**Tech Stack:** Node.js ES modules, built-in `node:test`, OpenAI-compatible image API, existing Shopee Local Studio configuration builder.

---

### Task 1: Adaptive Scheduler

**Files:**
- Create: `tools/image2_generator/src/adaptive-pool.js`
- Create: `tools/image2_generator/test/adaptive-pool.test.js`

- [ ] **Step 1: Write tests that describe initial concurrency, fallback, and fatal errors**

Create tests that import `runAdaptivePool`, use small deferred workers, and assert:

```js
assert.equal(maxActive, 4);
assert.equal(attempts.get("first"), 2);
assert.deepEqual(downgrades, [{ from: 4, to: 2 }]);
assert.ok(startsAfterDowngrade.every((count) => count <= 2));
await assert.rejects(
  runAdaptivePool(["bad"], options, permanentWorker),
  /bad request/
);
assert.equal(permanentAttempts, 1);
```

- [ ] **Step 2: Run the scheduler test and verify RED**

Run: `node --test test/adaptive-pool.test.js`

Expected: FAIL because `src/adaptive-pool.js` does not exist.

- [ ] **Step 3: Implement the minimal adaptive queue**

Create `runAdaptivePool(items, options, worker)` with this public contract:

```js
await runAdaptivePool(items, {
  maxConcurrency: 4,
  fallbackConcurrency: 2,
  isRetryable: (error) => boolean,
  onDowngrade: ({ from, to, error }) => {},
  onRequeue: ({ item, error }) => {}
}, worker);
```

The scheduler must start up to `maxConcurrency`, mark each queue entry with one fallback retry, lower the start limit before launching more work, wait for already-active work to settle, and reject after active work drains when an error is non-retryable or a fallback retry also fails.

- [ ] **Step 4: Run the scheduler test and verify GREEN**

Run: `node --test test/adaptive-pool.test.js`

Expected: all scheduler tests PASS.

- [ ] **Step 5: Commit the scheduler**

```powershell
git add tools/image2_generator/src/adaptive-pool.js tools/image2_generator/test/adaptive-pool.test.js
git commit -m "feat: add adaptive image job scheduler"
```

### Task 2: CLI Integration and Error Classification

**Files:**
- Modify: `tools/image2_generator/src/image2-client.js`
- Modify: `tools/image2_generator/src/cli.js`
- Modify: `tools/image2_generator/test/client.test.js`

- [ ] **Step 1: Add a failing classifier test**

Export and test `isRetryableImageError` with representative responses:

```js
assert.equal(isRetryableImageError(new Error("Image API 429: limited")), true);
assert.equal(isRetryableImageError(new Error("Image API 502: upstream")), true);
assert.equal(isRetryableImageError(new Error("Image API 400: invalid")), false);
```

- [ ] **Step 2: Run the client test and verify RED**

Run: `node --test test/client.test.js`

Expected: FAIL because `isRetryableImageError` is not exported.

- [ ] **Step 3: Export the existing classifier and replace the fixed pool**

Export `isRetryableImageError` without changing its matching rules. In `cli.js`, import `runAdaptivePool` and call it with:

```js
await runAdaptivePool(config.jobs, {
  maxConcurrency: config.concurrency,
  fallbackConcurrency: Math.min(2, config.concurrency),
  isRetryable: isRetryableImageError,
  onDowngrade: ({ from, to, error }) => {
    console.warn(`[image2] concurrency reduced ${from} -> ${to}: ${error.message}`);
  },
  onRequeue: ({ item }) => {
    console.warn(`[image2] requeue ${item.name} at reduced concurrency`);
  }
}, async (job) => {
  // Keep the existing skip, API call, write, square-fit, and completion behavior.
});
```

Remove the old private `runPool` from `cli.js`.

- [ ] **Step 4: Run image generator tests**

Run: `npm test`

Working directory: `tools/image2_generator`

Expected: all tests PASS.

- [ ] **Step 5: Commit CLI integration**

```powershell
git add tools/image2_generator/src/image2-client.js tools/image2_generator/src/cli.js tools/image2_generator/test/client.test.js
git commit -m "feat: downgrade image concurrency on transient failures"
```

### Task 3: Shopee Studio Default Concurrency

**Files:**
- Modify: `tools/shopee_local_studio/test/core.test.js`
- Modify: `tools/shopee_local_studio/src/core.js`

- [ ] **Step 1: Change the existing expectation to four**

In `buildImage2Config creates four PNG jobs per selected store`, assert:

```js
assert.equal(config.concurrency, 4);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test --test-name-pattern="buildImage2Config creates four PNG jobs" test/core.test.js`

Working directory: `tools/shopee_local_studio`

Expected: FAIL with actual concurrency `2`.

- [ ] **Step 3: Set the default maximum to four**

Change only the fallback value in `buildImage2Config`:

```js
concurrency: Number(task.concurrency || 4),
```

- [ ] **Step 4: Run the Shopee Studio suite**

Run: `npm test`

Working directory: `tools/shopee_local_studio`

Expected: all tests PASS.

- [ ] **Step 5: Preserve pre-existing Studio edits**

Do not commit `core.js` or `core.test.js` independently because both already contain user-owned changes from the ongoing Shopee workflow work. Inspect the exact two-line concurrency diff and leave those files in the working tree for the user's eventual consolidated commit.

### Task 4: Final Verification

**Files:**
- Verify only; no planned production edits.

- [ ] **Step 1: Run both complete test suites**

```powershell
Push-Location tools/image2_generator; npm test; Pop-Location
Push-Location tools/shopee_local_studio; npm test; Pop-Location
```

Expected: both commands exit `0` with zero failed tests.

- [ ] **Step 2: Validate a generated task configuration without making paid API calls**

Create or reuse a task object in the existing unit test path and verify it contains 24 jobs, concurrency 4, unchanged quality, and four consecutive job names for each store. Do not start live image generation.

- [ ] **Step 3: Check the final diff**

Run:

```powershell
git diff --check
git status --short
```

Expected: no whitespace errors; unrelated pre-existing working-tree changes remain untouched.
