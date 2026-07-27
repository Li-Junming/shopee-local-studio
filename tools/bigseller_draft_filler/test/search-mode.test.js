import assert from "node:assert/strict";
import test from "node:test";

import { chooseSearchModeTrigger, isSkuSearchModeText, normalizeSourceRowText } from "../src/fill-drafts.js";

test("normalizes source row text for source match evidence", () => {
  const text = normalizeSourceRowText("  Store 1\nSKU: YSLD80501\tLancome   Serum  ".repeat(8));

  assert.equal(text.length, 260);
  assert.equal(/\s{2,}/.test(text), false);
  assert.equal(text.startsWith("Store 1 SKU: YSLD80501 Lancome Serum"), true);
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
