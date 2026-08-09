import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const indexPath = path.resolve("public/index.html");
const stylesPath = path.resolve("public/styles.css");
const appPath = path.resolve("public/app.js");
const serverPath = path.resolve("src/server.js");

test("studio UI separates primary workflow from advanced operations", async () => {
  const html = await fs.readFile(indexPath, "utf8");

  assert.match(html, /class="[^"]*\bworkflow-card\b[^"]*"/);
  assert.match(html, /class="[^"]*\bworkflow-actions\b[^"]*"/);
  assert.match(html, /<details class="[^"]*\badvanced-section\b[^"]*"/);
  assert.match(html, /<details class="[^"]*\blog-section\b[^"]*"/);
  assert.ok(html.indexOf("id=\"runAllBtn\"") < html.indexOf("id=\"writeImageConfigBtn\""));
});

test("studio UI provides a local API configuration panel without exposing raw key state", async () => {
  const [html, app] = await Promise.all([
    fs.readFile(indexPath, "utf8"),
    fs.readFile(appPath, "utf8")
  ]);

  assert.match(html, /id="apiConfigForm"/);
  assert.match(html, /id="apiBaseUrl"/);
  assert.match(html, /id="apiKey"/);
  assert.match(html, /id="apiConfigStatus"/);
  assert.match(app, /loadApiConfig\(/);
  assert.match(app, /saveApiConfig\(/);
  assert.match(app, /\/api\/runtime-config/);
  assert.doesNotMatch(app, /apiKeyStatus\.textContent\s*=\s*data\.config\.apiKey/);
});

test("studio UI names product code input as Item ID", async () => {
  const [html, app] = await Promise.all([
    fs.readFile(indexPath, "utf8"),
    fs.readFile(appPath, "utf8")
  ]);

  assert.match(html, /Item ID\/SKU/);
  assert.match(html, /Item ID -&gt; SKU/);
  assert.match(app, /Item ID\/SKU/);
  assert.match(app, /Item ID\/SKU: \$\{risk\.matchedSkus\.join/);
});

test("quick start asks for a real Item ID before creating a task", async () => {
  const [html, app] = await Promise.all([
    fs.readFile(indexPath, "utf8"),
    fs.readFile(appPath, "utf8")
  ]);

  assert.match(html, />&#21019;&#24314;&#24182;&#24320;&#22987;</);
  assert.match(app, /function quickTaskInputText\(/);
  assert.match(app, /请先粘贴 Item ID\/SKU/);
  assert.match(app, /quickTaskText\.focus\(\)/);
});

test("studio UI keeps secondary controls collapsed in a light workspace", async () => {
  const [html, css] = await Promise.all([
    fs.readFile(indexPath, "utf8"),
    fs.readFile(stylesPath, "utf8")
  ]);

  assert.match(html, /<details class="[^"]*\btask-switcher\b[^"]*\badvanced-section\b[^"]*"/);
  assert.match(html, /<details class="[^"]*\bresults-library\b[^"]*\badvanced-section\b[^"]*"/);
  assert.ok(html.indexOf("id=\"taskSearch\"") > html.indexOf("class=\"task-switcher advanced-section\""));
  assert.match(css, /--bg:\s*#f[0-9a-f]{5};/i);
  assert.doesNotMatch(css, /--bg:\s*#07080a/i);
});

test("source review uses a calm label for missing SKU evidence", async () => {
  const app = await fs.readFile(appPath, "utf8");

  assert.doesNotMatch(app, /if \(level === "high"\) return "\\u9ad8\\u98ce\\u9669";/);
  assert.match(app, /if \(level === "high"\) return ".*SKU.*";/);
  assert.match(app, /\\u5df2\\u4eba\\u5de5\\u786e\\u8ba4/);
});

test("archived tasks have a dedicated restore and delete manager", async () => {
  const [html, app] = await Promise.all([
    fs.readFile(indexPath, "utf8"),
    fs.readFile(appPath, "utf8")
  ]);

  assert.match(html, /id="archivedTaskList"/);
  assert.match(app, /function renderArchivedTasks\(/);
  assert.match(app, /data-archive-action="restore"/);
  assert.match(app, /data-archive-action="delete"/);
  assert.match(app, /async function deleteArchivedTask\(/);
});

test("pending quick task preview accepts SKU text from the task form", async () => {
  const app = await fs.readFile(appPath, "utf8");

  assert.match(app, /function skuListFromValue\(/);
  assert.doesNotMatch(app, /pendingParsedTask\.skuGroup\?\.join/);
  assert.match(app, /skuListFromValue\(pendingParsedTask\.skuGroup\)/);
});

test("static studio assets are not cached during local iteration", async () => {
  const server = await fs.readFile(serverPath, "utf8");
  const staticHandler = server.slice(server.indexOf("async function serveStatic"));

  assert.match(staticHandler, /res\.writeHead\(200,\s*\{[\s\S]*"Cache-Control": "no-store"/);
});

test("one-click pipeline copies 1-store drafts before generating images", async () => {
  const server = await fs.readFile(serverPath, "utf8");
  const pipeline = server.slice(server.indexOf("async function runPipelineInBackground"));
  const copyStatusIndex = pipeline.indexOf("pipeline_copying_source_to_bigseller_drafts");
  const generateStatusIndex = pipeline.indexOf("pipeline_generating_images");
  const copyConfigIndex = pipeline.indexOf("writeBigSellerCopyConfig");
  const imageConfigIndex = pipeline.indexOf("writeImage2Config");
  const copyCommandIndex = pipeline.indexOf("\"bigseller_copy\"");
  const imageCommandIndex = pipeline.indexOf("\"image2\"");

  assert.ok(copyStatusIndex >= 0);
  assert.ok(generateStatusIndex >= 0);
  assert.ok(copyConfigIndex >= 0);
  assert.ok(imageConfigIndex >= 0);
  assert.ok(copyCommandIndex >= 0);
  assert.ok(imageCommandIndex >= 0);
  assert.ok(copyStatusIndex < generateStatusIndex);
  assert.ok(copyConfigIndex < imageConfigIndex);
  assert.ok(copyCommandIndex < imageCommandIndex);
});

test("one-click pipeline preserves resume state before queueing", async () => {
  const server = await fs.readFile(serverPath, "utf8");

  assert.match(server, /const resumeTask = structuredClone\(task\)/);
  assert.match(server, /pipelineStageCompleted\(resumeTask,\s*"bigseller_copy"/);
  assert.match(server, /pipelineStageCompleted\(resumeTask,\s*"image_generation"/);
});

test("direct BigSeller save refreshes listing files before launching the save script", async () => {
  const server = await fs.readFile(serverPath, "utf8");
  const saveFlow = server.slice(
    server.indexOf("async function runBigSellerSave"),
    server.indexOf("async function runFullPipeline")
  );

  const listingIndex = saveFlow.indexOf("writeListingFiles(task)");
  const statusIndex = saveFlow.indexOf("saving_bigseller_drafts");
  const commandIndex = saveFlow.indexOf("\"bigseller_save\"");

  assert.ok(listingIndex >= 0);
  assert.ok(statusIndex >= 0);
  assert.ok(commandIndex >= 0);
  assert.ok(listingIndex < statusIndex);
  assert.ok(statusIndex < commandIndex);
});

test("one-click pipeline marks a task active before launching the background worker", async () => {
  const server = await fs.readFile(serverPath, "utf8");
  const runFullPipeline = server.slice(
    server.indexOf("async function runFullPipeline"),
    server.indexOf("async function runFullPipelineRoute")
  );

  const activeMarkIndex = runFullPipeline.indexOf("activePipelines.add(task.id)");
  const launchIndex = runFullPipeline.indexOf("runPipelineInBackground(task.id)");

  assert.ok(activeMarkIndex >= 0);
  assert.ok(launchIndex >= 0);
  assert.ok(activeMarkIndex < launchIndex);
});

test("pipeline progress renders a visible step tracker", async () => {
  const app = await fs.readFile(appPath, "utf8");

  assert.match(app, /function pipelineSteps\(/);
  assert.match(app, /class="pipeline-steps"/);
  assert.match(app, /source_lookup/);
  assert.match(app, /bigseller_copy/);
  assert.match(app, /image_generation/);
  assert.match(app, /bigseller_save/);
});

test("pipeline progress renders timing-focused step cards", async () => {
  const [app, css] = await Promise.all([
    fs.readFile(appPath, "utf8"),
    fs.readFile(stylesPath, "utf8")
  ]);

  assert.match(app, /pipeline-step-card/);
  assert.match(app, /formatPipelineDuration\(/);
  assert.match(app, /progress\.timing/);
  assert.match(css, /\.pipeline-step-card/);
  assert.match(css, /\.pipeline-metrics/);
});

test("pipeline progress makes failed tasks visibly incomplete", async () => {
  const app = await fs.readFile(appPath, "utf8");

  assert.match(app, /pipelineVisibleStatus\(/);
  assert.match(app, /pipelineStepDisplayState\(/);
  assert.match(app, /timing\?\.stages\?\.\[step\.id\]\?\.finishedAt/);
  assert.match(app, /\\u6d41\\u7a0b\\u672a\\u5b8c\\u6210/);
  assert.match(app, /\\u5931\\u8d25\\u9636\\u6bb5/);
});

test("pipeline failure next action is rendered as a prominent state card", async () => {
  const [app, css] = await Promise.all([
    fs.readFile(appPath, "utf8"),
    fs.readFile(stylesPath, "utf8")
  ]);

  assert.match(app, /class="pipeline-next-action \$\{escapeHtml\(visibleStatus\.level\)\}"/);
  assert.match(app, /visibleStatus\.level === "error"/);
  assert.match(css, /\.pipeline-next-action/);
  assert.match(css, /\.pipeline-next-action\.error/);
});

test("one-click pipeline auto-confirms strong 1-store matches", async () => {
  const [server, core] = await Promise.all([
    fs.readFile(serverPath, "utf8"),
    fs.readFile(path.resolve("src/core.js"), "utf8")
  ]);
  const pipeline = server.slice(server.indexOf("async function runPipelineInBackground"));

  assert.match(core, /export function shouldAutoConfirmSource\(/);
  assert.match(server, /shouldAutoConfirmSource/);
  assert.match(pipeline, /autoConfirmSourceProduct\(task/);
  assert.match(server, /pipelineStartBlockers\(preflight,\s*task\)/);
});

test("source lookup failure pauses instead of silently allowing fallback generation", async () => {
  const server = await fs.readFile(serverPath, "utf8");
  const fallback = server.slice(
    server.indexOf("async function useFallbackSource"),
    server.indexOf("async function checkSourceProduct")
  );

  assert.match(fallback, /clearSourceEvidence\(task/);
  assert.match(fallback, /task\.sourceReviewRequired = true/);
  assert.match(fallback, /task\.status = "source_lookup_failed"/);
  assert.doesNotMatch(fallback, /task\.sourceReviewRequired = false/);
});

test("source lookup clears stale source SKU evidence before rerunning", async () => {
  const server = await fs.readFile(serverPath, "utf8");
  const checkSource = server.slice(
    server.indexOf("async function checkSourceProduct"),
    server.indexOf("async function confirmSourceProduct")
  );

  assert.match(server, /function clearSourceEvidence\(task/);
  assert.match(checkSource, /clearSourceEvidence\(task/);
  assert.match(server, /task\.sourceDraftSkuGroup = \[\]/);
  assert.match(server, /task\.sourceRowText = ""/);
});

test("one-click controls are disabled while pipeline is running and show completion copy", async () => {
  const app = await fs.readFile(appPath, "utf8");

  assert.match(app, /function isPipelineRunning\(/);
  assert.match(app, /setPrimaryPipelineButtonState\(/);
  assert.match(app, /runAllBtn\.disabled = !selectedTask \|\| running/);
  assert.match(app, /createRunBtn\.disabled = isPipelineRunning/);
  assert.match(app, /\\u5df2\\u4fdd\\u5b58\\u5230 BigSeller \\u8349\\u7a3f\\u7bb1/);
});

test("secondary mutating actions are disabled while the pipeline is running", async () => {
  const app = await fs.readFile(appPath, "utf8");

  assert.match(app, /const mutatingTaskActionButtonIds = /);
  assert.match(app, /setTaskActionButtonsDisabled\(!selectedTask,\s*data\.progress\)/);
  assert.match(app, /mutatingTaskActionButtonIds\.includes\(id\)/);
  assert.match(app, /running && mutatingTaskActionButtonIds/);
});
