import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("discover searches the draft list by SKU before matching store rows", async () => {
  const source = await readFile(new URL("../src/fill-drafts.js", import.meta.url), "utf8");
  const discoverStart = source.indexOf("async function discoverJobsFromSkuGroups");
  const storeLoop = source.indexOf("for (const store of config.storeMap)", discoverStart);
  const searchCall = source.indexOf("searchSourceRowBySkuGroup(listPage, listUrl, product.skus", discoverStart);

  assert.ok(discoverStart >= 0);
  assert.ok(searchCall > discoverStart);
  assert.ok(searchCall < storeLoop);
});

test("source lookup does not accept SKU-only rows when a source store is required", async () => {
  const source = await readFile(new URL("../src/fill-drafts.js", import.meta.url), "utf8");

  assert.doesNotMatch(source, /retrying by SKU only/);
  assert.doesNotMatch(source, /findSourceRowIndex\(page, skus, ""\)/);
  assert.doesNotMatch(source, /searchSourceRowBySkuGroup\(activePage, activeListUrl, product\.skus, ""\)/);
});

test("copy dialog store selection does not toggle already checked stores off", async () => {
  const source = await readFile(new URL("../src/fill-drafts.js", import.meta.url), "utf8");
  const selector = source.slice(
    source.indexOf("async function selectCopyDialogStores"),
    source.indexOf("async function confirmCopyDialog")
  );

  assert.match(selector, /checked/);
  assert.match(selector, /if \(!box\.checked\)/);
  assert.doesNotMatch(selector, /await page\.mouse\.click\(box\.x \+ box\.width \/ 2, box\.y \+ box\.height \/ 2\);\s*await page\.waitForTimeout\(150\);\s*selected\.push/s);
});
