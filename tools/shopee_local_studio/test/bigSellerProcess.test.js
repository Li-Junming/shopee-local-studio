import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildBigSellerCliArgs, verifyBigSellerCompletion } from "../src/bigSellerProcess.js";
import { COMPLETION_PREFIX } from "../../bigseller_draft_filler/src/cli-result.js";

const receipt = (mode) => `${COMPLETION_PREFIX}${JSON.stringify({ version: 1, mode, ok: true })}\n`;

test("all website BigSeller commands bypass PowerShell using explicit Node CLI arguments", async () => {
  const common = { cliPath: "C:/path with spaces/fill-drafts.js", configPath: "C:/任务/jobs.json" };
  for (const mode of ["copy", "save", "source", "discover"]) {
    const args = buildBigSellerCliArgs({ ...common, mode, outDir: "C:/任务/source", outPath: "C:/任务/discovered.json" });
    assert.deepEqual(args.slice(0, 4), [common.cliPath, "--config", common.configPath, `--${mode}`]);
    if (mode === "source") assert.deepEqual(args.slice(4), ["--out-dir", "C:/任务/source"]);
    if (mode === "discover") assert.deepEqual(args.slice(4), ["--out", "C:/任务/discovered.json"]);
  }
  const server = await fs.readFile(new URL("../src/server.js", import.meta.url), "utf8");
  assert.doesNotMatch(server, /bigSellerRun|"powershell"/);
  assert.equal((server.match(/"bigseller_(source|copy|discover|save)", process.execPath, buildBigSellerCliArgs/g) || []).length, 7);
});

test("exit-zero without receipt is rejected for every BigSeller mode", async () => {
  for (const mode of ["source", "copy", "discover", "save"]) {
    await assert.rejects(verifyBigSellerCompletion({}, `bigseller_${mode}`, ""), /完成凭据/);
  }
  assert.deepEqual(await verifyBigSellerCompletion({}, "image2", ""), {});
});

test("source success requires receipt plus a valid source manifest", async () => {
  await assert.rejects(verifyBigSellerCompletion({}, "bigseller_source", receipt("source"), { readSourceManifest: async () => null }), /来源图片清单/);
  assert.deepEqual(await verifyBigSellerCompletion({}, "bigseller_source", receipt("source"), {
    readSourceManifest: async () => ({ sourceImages: ["fixture.png"] })
  }), { verified: true });
});

test("discover success requires complete target draft links, not just an output file", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "studio-discover-test-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, "jobs.json");
  const task = { targetStores: ["4", "5"], paths: { bigsellerJobsConfig: file } };
  for (const jobs of [[], [{ editUrl: "fixture" }], [{ editUrl: "fixture" }, {}]]) {
    await fs.writeFile(file, JSON.stringify({ jobs }));
    await assert.rejects(verifyBigSellerCompletion(task, "bigseller_discover", receipt("discover")), /链接不完整/);
  }
  await fs.writeFile(file, JSON.stringify({ jobs: [{ editUrl: "fixture1" }, { editUrl: "fixture2" }] }));
  assert.deepEqual(await verifyBigSellerCompletion(task, "bigseller_discover", receipt("discover")), { verified: true });
});

test("source lookup failures retain their real cause instead of generating fallback buyer copy", async () => {
  const server = await fs.readFile(new URL("../src/server.js", import.meta.url), "utf8");
  const source = server.slice(server.indexOf("async function ensureSourceImages("), server.indexOf("async function applySourceManifest("));
  assert.match(source, /throw error/);
  assert.doesNotMatch(source, /useFallbackSource\(/);
  assert.match(source, /stat\?\.isFile\(\) && stat.size > 0/);
});

test('save receipt requires verified text and four saved images in every target store', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-save-check-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'jobs.json');
  await fs.writeFile(file, JSON.stringify({ jobs: [{ editUrl: 'draft1' }, { editUrl: 'draft2' }], requiredSaveVerificationVersion: 1 }));
  const task = { targetStores: ['4', '5'], paths: { bigsellerJobsConfig: file } };
  const writeProgress = entries => fs.writeFile(`${file}.save-progress.json`, JSON.stringify({ completedJobs: entries }));
  const verified = key => ({ key, verificationVersion: 1, assetSignature: 'fixture', verifiedImageCount: 4 });
  for (const entries of [[{ key: 'draft1' }, { key: 'draft2' }], [verified('draft1')], [verified('draft1'), { ...verified('draft2'), verifiedImageCount: 3 }]]) {
    await writeProgress(entries);
    await assert.rejects(verifyBigSellerCompletion(task, 'bigseller_save', receipt('save')), /四图复核/);
  }
  await writeProgress([verified('draft1'), verified('draft2')]);
  assert.deepEqual(await verifyBigSellerCompletion(task, 'bigseller_save', receipt('save')), { verified: true });
});
