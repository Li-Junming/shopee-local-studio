import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";

test("server startup reconciles abandoned tasks before serving and never resumes a running batch", async () => {
  const data = await fs.mkdtemp(path.join(os.tmpdir(), "studio-recovery-api-"));
  const taskDir = path.join(data, "tasks", "recovery-fixture");
  await fs.mkdir(path.join(taskDir, "images"), { recursive: true });
  const last = "2026-11-02T16:55:00.000Z";
  await fs.writeFile(path.join(taskDir, "task.json"), JSON.stringify({
    id: "recovery-fixture", productName: "Fixture", listingRuleVersion: 11,
    status: "pipeline_generating_images", updatedAt: last, createdAt: last, targetStores: ["4"],
    sourceImages: [], listings: {}, paths: { taskDir, imagesDir: path.join(taskDir, "images") },
    pipelineTiming: { startedAt: last, finishedAt: "", activeStage: "image_generation", stages: { image_generation: { startedAt: last } } }
  }));
  await fs.writeFile(path.join(data, "batch-queue.json"), JSON.stringify({ status: "running", currentIndex: 0,
    items: [{ index: 0, status: "running", taskId: "recovery-fixture", startedAt: last }] }));
  const idleDir = path.join(data, "tasks", "idle-fixture");
  await fs.mkdir(idleDir, { recursive: true });
  await fs.writeFile(path.join(idleDir, "task.json"), JSON.stringify({ id: "idle-fixture", productName: "Fixture idle",
    listingRuleVersion: 11, status: "created", updatedAt: last, createdAt: last, targetStores: ["4"], listings: {},
    paths: { taskDir: idleDir }, sourceImages: [] }));
  process.env.STUDIO_DATA_ROOT = data; process.env.PORT = "0";
  const { server } = await import(`../src/server.js?recovery-test=${Date.now()}`);
  if (!server.listening) await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const response = await fetch(`${base}/api/tasks/recovery-fixture`).then(r => r.json());
    assert.equal(response.task.status, "interrupted");
    assert.equal(response.task.pipelineTiming.finishedAt, last);
    await new Promise(resolve => setTimeout(resolve, 900));
    const queue = await fetch(`${base}/api/batch-queue`).then(r => r.json());
    assert.equal(queue.queue.status, "paused");
    assert.equal(queue.queue.runnerActive, false);
    assert.equal(queue.queue.currentIndex, 0);
    assert.match(await fs.readFile(path.join(taskDir, "logs.txt"), "utf8"), /TASK_EXECUTION_INTERRUPTED/);
    assert.doesNotMatch(await fs.readFile(path.join(taskDir, "logs.txt"), "utf8"), /\[image2\]|\[bigseller_/);
    assert.deepEqual(await fs.readdir(path.join(taskDir, "images")), []);
    const concurrent = await Promise.all(Array.from({ length: 10 }, () => fetch(`${base}/api/tasks/idle-fixture/image-review`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "pending" })
    }).then(r => r.status)));
    assert.ok(concurrent.includes(200));
    assert.ok(concurrent.includes(409), "simultaneous mutations must not all enter the task");
    const persisted = JSON.parse(await fs.readFile(path.join(idleDir, "task.json"), "utf8"));
    assert.equal(persisted.status, "created");
  } finally {
    await new Promise(resolve => server.close(resolve));
    await fs.rm(data, { recursive: true, force: true });
  }
});
