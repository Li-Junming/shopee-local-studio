import test from "node:test";
import assert from "node:assert/strict";
import { runAdaptivePool } from "../src/adaptive-pool.js";

test("starts four jobs then falls back to two and requeues a transient failure", async () => {
  const attempts = new Map();
  const downgrades = [];
  const requeues = [];
  const startsAfterDowngrade = [];
  let active = 0;
  let maxActive = 0;
  let downgraded = false;

  await runAdaptivePool(["first", "second", "third", "fourth", "fifth", "sixth"], {
    maxConcurrency: 4,
    fallbackConcurrency: 2,
    isRetryable: (error) => error.retryable === true,
    onDowngrade: ({ from, to }) => {
      downgraded = true;
      downgrades.push({ from, to });
    },
    onRequeue: ({ item }) => requeues.push(item)
  }, async (item) => {
    const attempt = (attempts.get(item) || 0) + 1;
    attempts.set(item, attempt);
    active += 1;
    maxActive = Math.max(maxActive, active);
    if (downgraded) startsAfterDowngrade.push(active);

    try {
      if (item === "first" && attempt === 1) {
        await delay(2);
        const error = new Error("temporary upstream failure");
        error.retryable = true;
        throw error;
      }
      await delay(10);
    } finally {
      active -= 1;
    }
  });

  assert.equal(maxActive, 4);
  assert.equal(attempts.get("first"), 2);
  assert.deepEqual(downgrades, [{ from: 4, to: 2 }]);
  assert.deepEqual(requeues, ["first"]);
  assert.ok(startsAfterDowngrade.length > 0);
  assert.ok(startsAfterDowngrade.every((count) => count <= 2));
});

test("does not requeue a non-retryable failure", async () => {
  let attempts = 0;

  await assert.rejects(
    runAdaptivePool(["bad"], {
      maxConcurrency: 4,
      fallbackConcurrency: 2,
      isRetryable: () => false
    }, async () => {
      attempts += 1;
      throw new Error("bad request");
    }),
    /bad request/
  );

  assert.equal(attempts, 1);
});

test("rejects when a requeued retryable failure fails again", async () => {
  let attempts = 0;

  await assert.rejects(
    runAdaptivePool(["unstable"], {
      maxConcurrency: 4,
      fallbackConcurrency: 2,
      isRetryable: (error) => error.retryable === true
    }, async () => {
      attempts += 1;
      const error = new Error(`temporary failure ${attempts}`);
      error.retryable = true;
      throw error;
    }),
    /temporary failure 2/
  );

  assert.equal(attempts, 2);
});

test("continues after failed items when continueOnError is enabled", async () => {
  const processed = [];
  const failures = [];

  const result = await runAdaptivePool(["bad", "later"], {
    maxConcurrency: 1,
    fallbackConcurrency: 1,
    isRetryable: () => false,
    continueOnError: true,
    onFailure: ({ item, error }) => failures.push({ item, message: error.message })
  }, async (item) => {
    processed.push(item);
    if (item === "bad") throw new Error("bad request");
  });

  assert.deepEqual(processed, ["bad", "later"]);
  assert.deepEqual(failures, [{ item: "bad", message: "bad request" }]);
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].item, "bad");
});

test("circuit breaks after too many retryable failures while continuing on error", async () => {
  const processed = [];

  await assert.rejects(
    runAdaptivePool(["bad-1", "bad-2", "bad-3", "later"], {
      maxConcurrency: 1,
      fallbackConcurrency: 1,
      isRetryable: (error) => error.retryable === true,
      continueOnError: true,
      maxRetryableFailures: 2
    }, async (item) => {
      processed.push(item);
      const error = new Error(`upstream EOF for ${item}`);
      error.retryable = true;
      throw error;
    }),
    /Too many retryable failures/
  );

  assert.deepEqual(processed, ["bad-1", "bad-1", "bad-2", "bad-2"]);
});

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
