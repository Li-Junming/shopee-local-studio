import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { openQueueCheckpoint } from "../src/queue-checkpoint.js";

async function fixture() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "image-queue-"));
  const jobs = ["a", "b", "c", "d"].map((name) => ({ name, outputPath: path.join(dir, `${name}.png`), prompt: "private prompt", images: [] }));
  return { jobs, filePath: path.join(dir, "queue.json"), sessionId: "session-1", maxAttempts: 2 };
}

test("restarting after two failures resumes untouched images before failed images", async () => {
  const options = await fixture();
  let queue = await openQueueCheckpoint(options.jobs, options);
  for (const job of options.jobs.slice(0, 2)) {
    await queue.start(job);
    await queue.fail(job, new Error("fixture timeout"), true);
  }
  queue = await openQueueCheckpoint(options.jobs, options);
  assert.deepEqual(queue.orderedJobs().map((job) => job.name), ["c", "d", "a", "b"]);
  const disk = await fs.readFile(options.filePath, "utf8");
  assert.doesNotMatch(disk, /private prompt|fixture timeout/);
  assert.equal(JSON.parse(disk).jobs[options.jobs[0].outputPath].attempts, 1);
});

test("in-flight work is rotated before a process crash and counts towards the budget", async () => {
  const options = await fixture();
  let queue = await openQueueCheckpoint(options.jobs, options);
  await queue.start(options.jobs[0]);
  queue = await openQueueCheckpoint(options.jobs, options);
  assert.equal(queue.orderedJobs()[0].name, "b");
  await queue.start(options.jobs[0]);
  await queue.fail(options.jobs[0], new Error("fixture"), true);
  queue = await openQueueCheckpoint(options.jobs, options);
  assert.equal(queue.eligible(options.jobs[0]), false);
  await assert.rejects(queue.start(options.jobs[0]), /IMAGE_QUEUE_EXHAUSTED/);
});

test("manual continuation resets the attempt budget but preserves fair ordering", async () => {
  const options = await fixture();
  let queue = await openQueueCheckpoint(options.jobs, options);
  await queue.start(options.jobs[0]);
  await queue.fail(options.jobs[0], new Error("fixture"), false);
  assert.equal(queue.eligible(options.jobs[0]), false);
  queue = await openQueueCheckpoint(options.jobs, { ...options, sessionId: "session-2" });
  assert.equal(queue.eligible(options.jobs[0]), true);
  assert.equal(queue.orderedJobs()[0].name, "b");
});

test("configuration changes reset affected counters without resurrecting unchanged blocked jobs", async () => {
  const options = await fixture();
  let queue = await openQueueCheckpoint(options.jobs, options);
  for (const job of options.jobs.slice(0, 2)) {
    await queue.start(job);
    await queue.fail(job, new Error("fixture"), false);
  }
  const changed = options.jobs.map((job, index) => index === 0 ? { ...job, prompt: "changed" } : job);
  queue = await openQueueCheckpoint(changed, options);
  assert.equal(queue.eligible(changed[0]), true);
  assert.equal(queue.eligible(changed[1]), false);
});

test("concurrent completions write one valid atomic checkpoint", async () => {
  const options = await fixture();
  const queue = await openQueueCheckpoint(options.jobs, options);
  await Promise.all(options.jobs.map(async (job) => {
    await queue.start(job);
    await queue.complete(job);
  }));
  const saved = JSON.parse(await fs.readFile(options.filePath, "utf8"));
  assert.ok(Object.values(saved.jobs).every((record) => record.status === "done" && record.attempts === 1));
});
