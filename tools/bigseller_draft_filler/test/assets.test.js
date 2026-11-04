import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { loadStoreAssets, fingerprintAssets } from "../src/assets.js";

test("loads title, detail, and sorted PNG product images", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "bigseller-assets-"));
  try {
    const storeDir = path.join(root, "store_8_skinora_beauty");
    await writeFile(path.join(root, "placeholder.txt"), "root");
    await import("node:fs/promises").then(({ mkdir }) => mkdir(storeDir));
    await writeFile(path.join(storeDir, "title.txt"), "  Title 8  \n");
    await writeFile(path.join(storeDir, "detail.txt"), "Detail 8\n");
    await writeFile(path.join(storeDir, "02_benefit.png"), "fake");
    await writeFile(path.join(storeDir, "01_main.png"), "fake");
    await writeFile(path.join(storeDir, "skip.jpg"), "fake");

    const assets = await loadStoreAssets(root, "store_8_skinora_beauty");

    assert.equal(assets.title, "Title 8");
    assert.equal(assets.detail, "Detail 8");
    assert.deepEqual(
      assets.images.map((imagePath) => path.basename(imagePath)),
      ["01_main.png", "02_benefit.png"]
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("requires title, detail, and at least one PNG image", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "bigseller-assets-"));
  try {
    await import("node:fs/promises").then(({ mkdir }) => mkdir(path.join(root, "store_7_skinora")));

    await assert.rejects(
      () => loadStoreAssets(root, "store_7_skinora"),
      /Missing title\.txt/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('save asset signatures change when copy or image bytes change', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'bigseller-signature-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const file = path.join(root, '01.png');
  await writeFile(file, 'first image');
  const assets = { title: 'Title', detail: 'Detail', images: [file] };
  const first = await fingerprintAssets(assets);
  const copyOnly = await fingerprintAssets(assets, { skipImages: true });
  assert.notEqual(await fingerprintAssets({ ...assets, detail: 'Updated detail' }), first);
  await writeFile(file, 'second image');
  assert.notEqual(await fingerprintAssets(assets), first);
  assert.equal(await fingerprintAssets(assets, { skipImages: true }), copyOnly);
});
