import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCopyDraftPlan,
  chooseSearchModeTrigger,
  isSkuSearchModeText,
  normalizeSourceRowText,
  rowMatchesSkuAndStore
} from "../src/fill-drafts.js";

test("normalizes source row text for source match evidence", () => {
  const text = normalizeSourceRowText("  Store 1\nSKU: YSLD80501\tLancome   Serum  ".repeat(8));

  assert.equal(text.length, 260);
  assert.equal(/\s{2,}/.test(text), false);
  assert.equal(text.startsWith("Store 1 SKU: YSLD80501 Lancome Serum"), true);
});

test("matches draft rows by SKU and normalized store name", () => {
  assert.equal(rowMatchesSkuAndStore("SKU001 \u5546\u54c1 \u59d0\u592b 4\u5e97\uff08\u80e1\uff09", ["SKU001"], "\u59d0\u592b4\u5e97(\u80e1)"), true);
  assert.equal(rowMatchesSkuAndStore("SKU001 \u5546\u54c1 \u59d0\u592b 5\u5e97\uff08\u80e1\uff09", ["SKU001"], "\u59d0\u592b4\u5e97(\u80e1)"), false);
  assert.equal(rowMatchesSkuAndStore("SKU999 \u5546\u54c1 \u59d0\u592b 4\u5e97\uff08\u80e1\uff09", ["SKU001"], "\u59d0\u592b4\u5e97(\u80e1)"), false);
});

test("plans copy targets by skipping stores that already have matching drafts", () => {
  const plan = buildCopyDraftPlan({
    draftRowTexts: [
      "SKU001 \u5546\u54c1 \u59d0\u592b 4\u5e97\uff08\u80e1\uff09",
      "SKU001 \u5546\u54c1 \u59d0\u592b 6\u5e97\uff08\u80e1\uff09"
    ],
    skus: ["SKU001"],
    storeMap: [
      { match: "\u59d0\u592b 4\u5e97\uff08\u80e1\uff09", folder: "store_4_skinora_care" },
      { match: "\u59d0\u592b 5\u5e97\uff08\u80e1\uff09", folder: "store_5_skinora_fresh" },
      { match: "\u59d0\u592b 6\u5e97\uff08\u80e1\uff09", folder: "store_6_skinora_luxe" }
    ]
  });

  assert.deepEqual(plan.targets.map((store) => store.folder), ["store_5_skinora_fresh"]);
  assert.deepEqual(plan.skipped.map((store) => store.folder), ["store_4_skinora_care", "store_6_skinora_luxe"]);
});

test("chooses the search type dropdown immediately left of the search input", () => {
  const inputBox = { x: 570, y: 516, width: 433, height: 39 };
  const candidates = [
    { index: 8, text: "产品名称", box: { x: 451, y: 516, width: 112, height: 39 } },
    { index: 38, text: "SKU", box: { x: 1130, y: 742, width: 40, height: 22 } },
    { index: 41, text: "SKU", box: { x: 880, y: 742, width: 40, height: 22 } }
  ];

  assert.deepEqual(chooseSearchModeTrigger(inputBox, candidates), candidates[0]);
});

test("recognizes SKU search mode exactly", () => {
  assert.equal(isSkuSearchModeText("SKU"), true);
  assert.equal(isSkuSearchModeText(" sku "), true);
  assert.equal(isSkuSearchModeText("SKU ID"), false);
  assert.equal(isSkuSearchModeText("产品名称"), false);
});
