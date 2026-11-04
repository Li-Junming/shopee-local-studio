import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { configuredStoreFrameRoot, defaultStoreFrameRoot, resolveStoreFrameAssets } from "../src/storeFrames.js";

test("saved frame directory survives launch without an environment override", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "store-frames-config-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const configPath = path.join(root, "config.json");
  await fs.writeFile(configPath, JSON.stringify({ root }));
  await fs.writeFile(path.join(root, "4店水印.png"), "frame");
  assert.equal(await configuredStoreFrameRoot({ env: {}, configPath }), root);
  const result = await resolveStoreFrameAssets({ env: {}, configPath, storeIds: ["4"] });
  assert.deepEqual(result.missing, []);
  const override = path.join(root, "override");
  assert.equal(await configuredStoreFrameRoot({ env: { SHOPEE_STORE_FRAME_ROOT: override }, configPath }), override);
  assert.equal(await configuredStoreFrameRoot({ env: {}, configPath: path.join(root, "absent.json") }), defaultStoreFrameRoot({}));
});

test("invalid saved frame directory fails explicitly instead of silently changing roots", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "store-frames-config-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const configPath = path.join(root, "config.json");
  await fs.writeFile(configPath, "{invalid");
  await assert.rejects(configuredStoreFrameRoot({ env: {}, configPath }), /Cannot read store frame/);
  await fs.writeFile(configPath, JSON.stringify({ root: "relative" }));
  await assert.rejects(configuredStoreFrameRoot({ env: {}, configPath }), /absolute root/);
});

test("resolveStoreFrameAssets matches watermark files and ignores avatars", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "store-frames-"));
  await fs.writeFile(path.join(root, "胡志明 7店 头像.png"), "avatar");
  await fs.writeFile(path.join(root, "胡志明 7店 水印.png"), "watermark");

  const result = await resolveStoreFrameAssets({ root, storeIds: ["7"] });

  assert.equal(result.root, root);
  assert.deepEqual(result.missing, []);
  assert.equal(result.frames["7"].fileName, "胡志明 7店 水印.png");
  assert.equal(result.frames["7"].path, path.join(root, "胡志明 7店 水印.png"));
});

test("resolveStoreFrameAssets reports missing store assets without throwing", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "store-frames-"));
  await fs.writeFile(path.join(root, "胡志明 4店 水印.png"), "watermark");

  const result = await resolveStoreFrameAssets({ root, storeIds: ["4", "6"] });

  assert.equal(result.frames["4"].fileName, "胡志明 4店 水印.png");
  assert.equal(result.frames["6"], undefined);
  assert.deepEqual(result.missing, ["6"]);
});

test("resolveStoreFrameAssets matches warehouse store names with spacing", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "store-frames-"));
  await fs.writeFile(path.join(root, "\u80e1\u5fd7\u660e2\u4ed3 1\u5e97 \u6c34\u5370.png"), "watermark");
  await fs.writeFile(path.join(root, "\u80e1\u5fd7\u660e2\u4ed3 2\u5e97 \u6c34\u5370.png"), "watermark");

  const result = await resolveStoreFrameAssets({ root, storeIds: ["2\u4ed31", "2\u4ed32"] });

  assert.deepEqual(result.missing, []);
  assert.equal(result.frames["2\u4ed31"].fileName, "\u80e1\u5fd7\u660e2\u4ed3 1\u5e97 \u6c34\u5370.png");
  assert.equal(result.frames["2\u4ed32"].fileName, "\u80e1\u5fd7\u660e2\u4ed3 2\u5e97 \u6c34\u5370.png");
});
