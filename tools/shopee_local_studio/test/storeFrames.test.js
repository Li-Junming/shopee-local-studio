import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { resolveStoreFrameAssets } from "../src/storeFrames.js";

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
