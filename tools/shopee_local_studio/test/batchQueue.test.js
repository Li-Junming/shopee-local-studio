import assert from "node:assert/strict";
import test from "node:test";
import {
  batchQueueCounts,
  createBatchQueueRecord,
  currentBatchItem,
  parseBatchInputs
} from "../src/batchQueue.js";

test("batch inputs preserve the operator's order", () => {
  assert.deepEqual(parseBatchInputs("42979320662\n53368953856\nSF86102"), [
    "42979320662",
    "53368953856",
    "SF86102"
  ]);
});

test("batch inputs accept comma-separated values but reject an empty list", () => {
  assert.deepEqual(parseBatchInputs("A, B，C；D"), ["A", "B", "C", "D"]);
  assert.throws(() => parseBatchInputs(" \n "), /Item ID\/SKU/);
});

test("batch queue advances past completed and skipped items", () => {
  const queue = createBatchQueueRecord({
    inputs: ["A", "B", "C"],
    targetStores: ["4", "5"],
    now: "2026-10-16T00:00:00.000Z"
  });
  queue.items[0].status = "done";
  queue.items[1].status = "skipped";
  queue.currentIndex = 0;

  assert.equal(currentBatchItem(queue).input, "C");
  assert.deepEqual(batchQueueCounts(queue), {
    total: 3,
    done: 1,
    skipped: 1,
    failed: 0,
    waiting: 1
  });
});

test("a failed item stays current so resume retries the same task", () => {
  const queue = createBatchQueueRecord({ inputs: ["A", "B"], targetStores: ["4"] });
  queue.items[0].status = "failed";
  queue.items[0].taskId = "task-a";

  assert.equal(currentBatchItem(queue).taskId, "task-a");
  assert.equal(batchQueueCounts(queue).failed, 1);
});
