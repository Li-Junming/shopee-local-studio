import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCopyDraftPlan,
  buildSourceSearchAttempts,
  chooseStatusTabControl,
  chooseCopyToDraftControl,
  chooseSearchModeOption,
  chooseSearchModeTrigger,
  isItemIdSearchModeText,
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

test("chooses the real Chinese product-name dropdown immediately left of the search input", () => {
  const inputBox = { x: 475, y: 448, width: 361, height: 32 };
  const candidates = [
    { index: 2, text: "\u4ea7\u54c1\u540d\u79f0", box: { x: 390, y: 448, width: 80, height: 32 } },
    { index: 55, text: "SKU", box: { x: 1583, y: 785, width: 50, height: 28 } }
  ];

  assert.deepEqual(chooseSearchModeTrigger(inputBox, candidates), candidates[0]);
});

test("recognizes SKU search mode exactly", () => {
  assert.equal(isSkuSearchModeText("SKU"), true);
  assert.equal(isSkuSearchModeText(" sku "), true);
  assert.equal(isSkuSearchModeText("SKU ID"), false);
  assert.equal(isSkuSearchModeText("产品名称"), false);
});
test("chooses SKU option when BigSeller duplicates visible and hidden option text", () => {
  const triggerBox = { x: 61, y: 19, width: 100, height: 32 };
  const options = [
    { index: 10, text: "\u4ea7\u54c1\u540d\u79f0 \u4ea7\u54c1\u540d\u79f0", box: { x: 61, y: 55, width: 100, height: 32 } },
    { index: 11, text: "SKU SKU", box: { x: 61, y: 87, width: 100, height: 32 } },
    { index: 12, text: "SKU ID", box: { x: 61, y: 119, width: 100, height: 32 } }
  ];

  assert.equal(chooseSearchModeOption(triggerBox, options, "SKU")?.index, 11);
});

test("chooses the copy draft control over SKU copy icons", () => {
  const controls = [
    { index: 0, text: "", aria: "", title: "", className: "sku-copy copy-icon", box: { x: 1120, y: 20, width: 18, height: 18 } },
    { index: 1, text: "", aria: "", title: "\u590d\u5236", className: "action-icon", box: { x: 1910, y: 22, width: 18, height: 18 } }
  ];

  assert.equal(chooseCopyToDraftControl(controls, { x: 0, y: 0, width: 2000, height: 120 })?.index, 1);
});

test("allows copy class fallback only in the right-side action area", () => {
  const controls = [
    { index: 0, text: "", aria: "", title: "", className: "copy-icon", box: { x: 1040, y: 20, width: 18, height: 18 } },
    { index: 1, text: "", aria: "", title: "", className: "copy-icon", box: { x: 1900, y: 22, width: 18, height: 18 } }
  ];

  assert.equal(chooseCopyToDraftControl(controls, { x: 0, y: 0, width: 2000, height: 120 })?.index, 1);
});

test("recognizes Item ID search mode", () => {
  assert.equal(isItemIdSearchModeText("Item ID"), true);
  assert.equal(isItemIdSearchModeText(" item id "), true);
  assert.equal(isItemIdSearchModeText("\u5546\u54c1ID"), true);
  assert.equal(isItemIdSearchModeText("SKU ID"), false);
});

test("source search falls back from SKU to sold-out Item ID", () => {
  const attempts = buildSourceSearchAttempts({
    skus: ["XL86301"],
    itemIds: ["53765401701"]
  });

  assert.deepEqual(attempts, [
    { mode: "SKU", values: ["XL86301"], soldOut: false },
    { mode: "Item ID", values: ["53765401701"], soldOut: true }
  ]);
});

test("numeric source SKU input is also tried as sold-out Item ID", () => {
  const attempts = buildSourceSearchAttempts({
    skus: ["47815413330"]
  });

  assert.deepEqual(attempts, [
    { mode: "SKU", values: ["47815413330"], soldOut: false },
    { mode: "Item ID", values: ["47815413330"], soldOut: true }
  ]);
});

test("chooses the smallest matching sold-out status tab instead of its parent row", () => {
  const controls = [
    { index: 0, text: "在售 (0) 售完 (4) 审核中 (0)", box: { x: 230, y: 520, width: 440, height: 40 } },
    { index: 1, text: "在售 (0)", box: { x: 250, y: 525, width: 72, height: 28 } },
    { index: 2, text: "售完 (4)", box: { x: 340, y: 525, width: 72, height: 28 } }
  ];

  assert.equal(chooseStatusTabControl(controls, "\u552e\u5b8c")?.index, 2);
});
