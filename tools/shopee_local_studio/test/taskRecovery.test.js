import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { interruptedTask, interruptedBatchQueue, recoverTaskFiles, inspectTaskWorkers } from "../src/taskRecovery.js";
import { buildTaskProgress, pipelineStageCompleted, recordPipelineTiming } from "../src/core.js";

const start = "2026-11-02T16:54:52.000Z";
const activity = "2026-11-02T16:55:00.000Z";
const detected = "2026-11-03T01:55:00.000Z";
const fixture = () => ({ id: "fixture", status: "pipeline_generating_images", updatedAt: activity, targetStores: ["4"], skuGroup: ["FIXTURE"],
  listings: { "4": { title: "keep", detail: "keep" } }, sourceImages: ["keep-source"],
  pipelineTiming: recordPipelineTiming(recordPipelineTiming(null, "pipeline_queued", start), "pipeline_generating_images", start),
  commandResults: { bigseller_copy: { exitCode: 0, verified: true } }
});

test("restart reconciliation freezes at last confirmed activity, not nine hours later", () => {
  const task = fixture();
  const before = structuredClone(task);
  const next = interruptedTask(task, { now: detected, workersKnown: true });
  assert.deepEqual(task, before);
  assert.equal(next.status, "interrupted");
  assert.equal(next.pipelineTiming.finishedAt, activity);
  assert.equal(next.pipelineTiming.stages.image_generation.finishedAt, activity);
  assert.equal(next.pipelineTiming.stages.image_generation.outcome, "interrupted");
  assert.equal(next.interruption.exactStopTimeKnown, false);
  assert.deepEqual(next.listings, before.listings);
  assert.deepEqual(next.commandResults, before.commandResults);
  assert.equal(pipelineStageCompleted(next, "image_generation"), false);
  const progress = buildTaskProgress(next);
  assert.equal(progress.level, "error");
  assert.match(progress.label, /中断/);
  assert.match(progress.nextAction, /不会自动重试/);
  assert.equal(interruptedTask(next, { now: detected }), null);
});

test("idle/completed/failed tasks are untouched, but abandoned config preparation is reconciled", () => {
  for (const status of ["created", "source_review_required", "pipeline_done", "pipeline_failed", "image2_done", "image2_failed"]) {
    assert.equal(interruptedTask({ ...fixture(), status }, { now: detected }), null);
  }
  assert.equal(interruptedTask({ status: "image2_config_ready" }, { now: detected }), null);
  assert.equal(interruptedTask({ ...fixture(), status: "bigseller_config_ready" }, { now: detected }).status, "interrupted");
});

test("orphan workers and inventory failure remain explicit and never imply success", () => {
  for (const workersKnown of [true, false]) {
    const next = interruptedTask(fixture(), { now: detected, workersKnown, workerPids: [1234] });
    assert.equal(next.status, "interrupted");
    assert.equal(next.interruption.workersKnown, workersKnown);
    assert.deepEqual(next.interruption.workerPids, [1234]);
  }
});

test("standalone interrupted images do not direct users into automatic BigSeller work", () => {
  const task = fixture(); task.pipelineTiming.scope = "images_only";
  const progress = buildTaskProgress(interruptedTask(task, { now: detected }));
  assert.match(progress.nextAction, /生成图片补缺图/);
  assert.match(progress.nextAction, /不自动操作 BigSeller/);
});

test("batch restart pauses in place without advancing items or silently retrying", () => {
  const queue = { status: "running", currentIndex: 0, updatedAt: activity,
    items: [{ index: 0, taskId: "fixture", status: "running", startedAt: start }, { index: 1, status: "waiting" }] };
  const next = interruptedBatchQueue(queue, detected);
  assert.equal(queue.status, "running");
  assert.equal(next.status, "paused");
  assert.equal(next.currentIndex, 0);
  assert.equal(next.items[0].status, "failed");
  assert.equal(next.items[1].status, "waiting");
  assert.match(next.lastMessage, /不会自动重放/);
  assert.equal(interruptedBatchQueue(next), null);
  assert.equal(interruptedBatchQueue({ status: "ready" }), null);
});

test("disk recovery preserves image bytes and queue checkpoints and logs only once", async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "studio-task-recovery-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const taskDir = path.join(dir, "fixture");
  await fs.mkdir(path.join(taskDir, "images"), { recursive: true });
  const task = fixture(); task.paths = { taskDir };
  await fs.writeFile(path.join(taskDir, "task.json"), JSON.stringify(task));
  await fs.writeFile(path.join(taskDir, "logs.txt"), "existing diagnostic\n");
  await fs.utimes(path.join(taskDir, "logs.txt"), new Date(activity), new Date(activity));
  const preserved = ["images/01.png", "image2.jobs.json.queue-state.json", "bigseller.copy-jobs.json"];
  for (const file of preserved) await fs.writeFile(path.join(taskDir, file), `keep:${file}`);
  assert.deepEqual(await recoverTaskFiles(dir, { inventory: { known: true, workers: [] }, now: detected }), ["fixture"]);
  const saved = JSON.parse(await fs.readFile(path.join(taskDir, "task.json"), "utf8"));
  assert.equal(saved.pipelineTiming.finishedAt, activity);
  const log = await fs.readFile(path.join(taskDir, "logs.txt"), "utf8");
  assert.match(log, /No automatic retry/);
  assert.deepEqual(await recoverTaskFiles(dir, { now: detected }), []);
  assert.equal(await fs.readFile(path.join(taskDir, "logs.txt"), "utf8"), log);
  for (const file of preserved) assert.equal(await fs.readFile(path.join(taskDir, file), "utf8"), `keep:${file}`);
  assert.equal((await fs.readdir(taskDir)).some(file => file.endsWith(".tmp")), false);
});

test("unavailable process inspection fails closed, rather than assuming no worker", async () => {
  assert.deepEqual(await inspectTaskWorkers("/fixture", { platform: "unsupported" }), { known: false, workers: [] });
  const source = await fs.readFile(new URL("../src/server.js", import.meta.url), "utf8");
  const handler = source.slice(source.indexOf("async function assertInterruptedTaskIdle("), source.indexOf("async function runBatchQueue("));
  for (const inventory of [{ known: false, workers: [] }, { known: true, workers: [{ taskId: "fixture", pid: 1234 }] }]) {
    const context = vm.createContext({ inspectTaskWorkers: async () => inventory, dataRoot: "/fixture" });
    vm.runInContext(handler, context);
    await assert.rejects(context.assertInterruptedTaskIdle({ id: "fixture" }), error => error.statusCode === 409);
  }
});

test("front-end stops interrupted clocks and disables mutations throughout cooldown", async () => {
  const source = await fs.readFile(new URL("../public/app.js", import.meta.url), "utf8");
  const busy = source.slice(source.indexOf("function isPipelineRunning("), source.indexOf("function setPrimaryPipelineButtonState("));
  const timing = source.slice(source.indexOf("function pipelineMetrics("), source.indexOf("function pipelineStepStateLabel("));
  const context = vm.createContext({});
  vm.runInContext(busy + timing, context);
  assert.equal(context.isPipelineRunning({ status: "pipeline_waiting_image_api" }), true);
  assert.equal(context.isPipelineRunning({ status: "interrupted" }), false);
  const progress = buildTaskProgress(interruptedTask(fixture(), { now: detected }));
  assert.equal(context.pipelineMetrics(progress).total, "8秒");
  assert.equal(context.formatPipelineStepDuration({ id: "image_generation" }, progress.timing), "8秒");
});
