import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { buildTaskProgress, recordPipelineTiming, startStandaloneImageTiming } from "../src/core.js";

const start = "2026-11-02T04:38:43.000Z";
const end = "2026-11-02T04:40:43.000Z";

test("standalone image run starts fresh and closes timing on success or failure", () => {
  for (const status of ["image2_done", "image2_failed"]) {
    const timing = startStandaloneImageTiming(start);
    assert.equal(timing.startedAt, start);
    assert.equal(timing.finishedAt, "");
    assert.deepEqual(Object.keys(timing.stages), ["image_generation"]);
    const finished = recordPipelineTiming(timing, status, end);
    assert.equal(finished.finishedAt, end);
    assert.equal(finished.stages.image_generation.finishedAt, end);
    assert.equal(finished.stages.image_generation.outcome, status === "image2_done" ? "success" : "failed");
    assert.equal(timing.finishedAt, "");
  }
  const full = recordPipelineTiming(startStandaloneImageTiming(start), "pipeline_queued", end);
  assert.equal(full.scope, undefined);
  assert.equal(full.startedAt, end);
});

test("standalone progress never promises automatic BigSeller work", () => {
  const pipelineTiming = startStandaloneImageTiming(start);
  const running = buildTaskProgress({ status: "generating_images", pipelineTiming });
  assert.equal(running.stage, "image_generation");
  assert.equal(running.level, "running");
  assert.match(running.nextAction, /不会自动/);
  const finished = buildTaskProgress({ status: "image2_done", pipelineTiming });
  assert.equal(finished.stage, "image_generation");
  assert.equal(finished.level, "ready");
  assert.match(finished.message, /没有执行 BigSeller/);
  const failed = buildTaskProgress({ status: "image2_failed", pipelineTiming });
  assert.equal(failed.level, "error");
  assert.match(failed.nextAction, /生成图片补缺图/);
});

test("real front-end helpers show only this image run and prioritize active status over stale finish time", async () => {
  const source = await fs.readFile(new URL("../public/app.js", import.meta.url), "utf8");
  const helpers = source.slice(source.indexOf("function pipelineStepDefinitions("), source.indexOf("function pipelineVisibleStatus("));
  const failures = source.slice(source.indexOf("function pipelineFailedStage("), source.indexOf("function pipelineStepLabel("));
  const context = vm.createContext({});
  vm.runInContext(helpers + failures, context);
  const progress = { stage: "image_generation", level: "running", timing: startStandaloneImageTiming(start) };
  let steps = context.pipelineSteps(progress);
  assert.equal(steps.length, 1);
  assert.equal(steps[0].state, "active");
  progress.timing.stages.image_generation.finishedAt = end;
  assert.equal(context.pipelineSteps(progress)[0].state, "active");
  progress.level = "ready";
  assert.equal(context.pipelineSteps(progress)[0].state, "done");
  progress.stage = "failed";
  progress.level = "error";
  assert.equal(context.pipelineSteps(progress)[0].state, "error");
  const legacy = { stage: "image_generation", level: "running", timing: { stages: { image_generation: { finishedAt: end } } } };
  assert.equal(context.pipelineSteps(legacy).find((step) => step.id === "image_generation").state, "active");
});

test("manual image route resets timing before launching the worker and records its terminal timing", async () => {
  const server = await fs.readFile(new URL("../src/server.js", import.meta.url), "utf8");
  const route = server.slice(server.indexOf("async function runImage2("), server.indexOf("async function runBigSellerDiscover("));
  assert.ok(route.indexOf("pipelineTimingHistory") < route.indexOf("startStandaloneImageTiming()"));
  assert.ok(route.indexOf("startStandaloneImageTiming()") < route.indexOf("runCommand(task"));
  assert.match(server, /recordPipelineTiming\(fresh.pipelineTiming, fresh.status, fresh.updatedAt\)/);
});

test('completed tasks never keep counting an unfinished legacy done-stage timer', async () => {
  const source = await fs.readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const functions = source.slice(source.indexOf('function pipelineMetrics('), source.indexOf('function progressStageLabel('));
  const context = vm.createContext({});
  vm.runInContext(functions, context);
  const timing = { startedAt: start, finishedAt: end, activeStage: 'done', stages: { done: { startedAt: end } } };
  assert.equal(context.pipelineMetrics({ stage: 'done', timing }).current, '已完成');
  assert.equal(context.formatPipelineStepDuration({ id: 'done', state: 'done' }, timing), '已完成');
  const finished = recordPipelineTiming(timing, 'pipeline_done', end);
  assert.equal(finished.stages.done.finishedAt, end);
});
