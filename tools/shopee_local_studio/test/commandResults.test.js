import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { EventEmitter } from "node:events";
import vm from "node:vm";
import { pipelineStageCompleted, recordCommandResult, recordPipelineTiming } from "../src/core.js";
import { childProcessEnv } from "../src/processRuntime.js";
import { verifyBigSellerCompletion } from "../src/bigSellerProcess.js";
import { COMPLETION_PREFIX } from "../../bigseller_draft_filler/src/cli-result.js";

test("a copy failure's finish timestamp is never treated as proof of success", () => {
  let timing = recordPipelineTiming(null, "pipeline_copying_source_to_bigseller_drafts", "2026-11-02T05:00:00Z");
  timing = recordPipelineTiming(timing, "pipeline_failed", "2026-11-02T05:00:01Z");
  assert.ok(timing.stages.bigseller_copy.finishedAt);
  assert.equal(pipelineStageCompleted({ status: "pipeline_failed", pipelineTiming: timing }, "bigseller_copy"), false);
});

test("copy exit zero survives timing reset, but failed and missing exit codes cannot skip copy", () => {
  const task = { status: "pipeline_failed", targetStores: ["4", "5"], skuGroup: ["XL86M01"] };
  for (const exitCode of [0, 1, null]) {
    const commandResults = recordCommandResult(task, "bigseller_copy", exitCode, "2026-11-02T05:00:00Z", { verified: exitCode === 0 });
    const fresh = { ...task, commandResults, pipelineTiming: recordPipelineTiming(null, "pipeline_queued") };
    assert.equal(pipelineStageCompleted(fresh, "bigseller_copy"), exitCode === 0);
    assert.equal(task.commandResults, undefined);
  }
});

test("copy proof cannot be reused for a different target store or SKU", () => {
  const task = { targetStores: ["4", "5"], skuGroup: ["XL86M01"] };
  task.commandResults = recordCommandResult(task, "bigseller_copy", 0, undefined, { verified: true });
  assert.equal(pipelineStageCompleted({ ...task, targetStores: ["5", "4"] }, "bigseller_copy"), true);
  assert.equal(pipelineStageCompleted({ ...task, targetStores: ["4", "6"] }, "bigseller_copy"), false);
  assert.equal(pipelineStageCompleted({ ...task, skuGroup: ["OTHER01"] }, "bigseller_copy"), false);
  task.commandResults = recordCommandResult(task, "bigseller_copy", 1);
  assert.equal(pipelineStageCompleted(task, "bigseller_copy"), false);
  // Already-discovered drafts remain usable; copy is not demanded again.
  assert.equal(pipelineStageCompleted(task, "bigseller_copy", { hasDiscoveredConfig: true }), true);
});

test("manual and pipeline commands share validation, environment and actual exit persistence", async () => {
  const server = await fs.readFile(new URL("../src/server.js", import.meta.url), "utf8");
  const handlers = server.slice(server.indexOf("function runCommand("), server.indexOf("async function updateStatus("));
  assert.equal((handlers.match(/env: childProcessEnv\(options.env \|\| process.env\)/g) || []).length, 1);
  assert.equal((handlers.match(/recordCommandResult\(fresh, label, code/g) || []).length, 1);
  assert.match(handlers, /return runCommandAsync\(task, label, command, args, cwd, options\)/);
  assert.match(handlers, /await verifyBigSellerCompletion/);
  assert.doesNotMatch(handlers, /child.on\("exit"/);
});

test("pipeline command persists copy success or failure before returning to its caller", async () => {
  const source = await fs.readFile(new URL("../src/server.js", import.meta.url), "utf8");
  const handler = source.slice(source.indexOf("function runCommandAsync("), source.indexOf("async function updateStatus("));
  for (const { code, output, success } of [
    { code: 0, output: `${COMPLETION_PREFIX}{"version":1,"mode":"copy","ok":true}\n`, success: true },
    { code: 0, output: "", success: false },
    { code: 0, output: `${COMPLETION_PREFIX}{"version":1,"mode":"save","ok":true}\n`, success: false },
    { code: 1, output: "", success: false },
    { code: null, output: "", success: false }
  ]) {
    let saved = { id: "fixture", status: "pipeline_copying_source_to_bigseller_drafts", targetStores: ["4"], skuGroup: ["XL86M01"] };
    let spawnedEnv;
    const sandbox = {
      activeCommands: new Map(),
      process: { env: {}, execPath: process.execPath },
      childProcessEnv: (env) => childProcessEnv(env, process.execPath, process.platform),
      appendLog: async () => {},
      readTask: async () => structuredClone(saved),
      saveTask: async (task) => { saved = structuredClone(task); },
      recordCommandResult,
      verifyBigSellerCompletion,
      readSourceManifest: async () => null,
      spawn: (_command, _args, options) => {
        spawnedEnv = options.env;
        const child = new EventEmitter();
        child.stdout = new EventEmitter();
        child.stderr = new EventEmitter();
        child.stdout.setEncoding = child.stderr.setEncoding = () => {};
        setImmediate(() => { child.stdout.emit("data", output); child.emit("close", code); });
        return child;
      }
    };
    vm.runInNewContext(handler, sandbox);
    const result = sandbox.runCommandAsync(saved, "bigseller_copy", "fixture", [], ".");
    if (success) await result;
    else await assert.rejects(result, /bigseller_copy/);
    assert.equal(spawnedEnv.SHOPEE_NODE_EXE, process.execPath);
    assert.equal(saved.commandResults.bigseller_copy.exitCode, code);
    assert.equal(pipelineStageCompleted(saved, "bigseller_copy"), success);
    assert.equal(sandbox.activeCommands.size, 0);
    if (code === 0 && !success) assert.equal(saved.commandResults.bigseller_copy.verified, false);
  }
});

test("historical zero exits without completion evidence cannot skip BigSeller steps", () => {
  for (const stage of ["bigseller_copy", "bigseller_discover", "bigseller_save"]) {
    const task = { status: `${stage}_done`, targetStores: ["4"], skuGroup: ["XL86M01"] };
    task.commandResults = recordCommandResult(task, stage, 0);
    assert.equal(pipelineStageCompleted(task, stage), false);
    task.commandResults = recordCommandResult(task, stage, 0, undefined, { verified: true });
    assert.equal(pipelineStageCompleted(task, stage), true);
  }
});

test("manual BigSeller buttons cannot mark a silent exit zero as done", async () => {
  const source = await fs.readFile(new URL("../src/server.js", import.meta.url), "utf8");
  const handlers = source.slice(source.indexOf("function runCommand("), source.indexOf("async function updateStatus("));
  for (const success of [true, false]) {
    let saved = { id: "fixture", status: "copying_source_to_bigseller_drafts", targetStores: ["4"], skuGroup: ["XL86M01"] };
    const sandbox = {
      activeCommands: new Map(),
      process: { env: {}, execPath: process.execPath },
      childProcessEnv: (env) => childProcessEnv(env),
      appendLog: async () => {},
      readTask: async () => structuredClone(saved),
      saveTask: async (task) => { saved = structuredClone(task); },
      recordCommandResult, recordPipelineTiming, verifyBigSellerCompletion,
      readSourceManifest: async () => null,
      spawn: () => {
        const child = new EventEmitter();
        child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
        child.stdout.setEncoding = child.stderr.setEncoding = () => {};
        setImmediate(() => {
          child.stdout.emit("data", success ? `${COMPLETION_PREFIX}{"version":1,"mode":"copy","ok":true}\n` : "");
          child.emit("close", 0);
        });
        return child;
      }
    };
    vm.runInNewContext(handlers, sandbox);
    await sandbox.runCommand(saved, "bigseller_copy", "fixture", [], ".");
    assert.equal(saved.status, success ? "bigseller_copy_done" : "bigseller_copy_failed");
    assert.equal(saved.commandResults.bigseller_copy.exitCode, 0);
    assert.equal(saved.commandResults.bigseller_copy.verified, success);
  }
});
