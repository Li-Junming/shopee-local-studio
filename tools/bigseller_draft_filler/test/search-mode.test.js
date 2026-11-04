import assert from "node:assert/strict";
import test from "node:test";

import {
  bigSellerUploadBlockReason,
  buildCopyDraftPlan,
  buildSourceSearchAttempts,
  chooseStatusTabControl,
  chooseCopyToDraftControl,
  chooseSearchModeOption,
  chooseSearchModeTrigger,
  fallbackSearchModeTriggerBox,
  isItemIdSearchModeText,
  isNonRetryableBigSellerError,
  isSkuSearchModeText,
  normalizeSourceRowText,
  pendingSaveJobs,
  resolveEditUrlCandidate,
  rowMatchesSkuAndStore
} from "../src/fill-drafts.js";

test("reports BigSeller material-center quota failures immediately", () => {
  assert.equal(
    bigSellerUploadBlockReason({ code: -1, msg: "可用素材中心空间不足，请清理素材" }),
    "可用素材中心空间不足，请清理素材"
  );
  assert.equal(
    bigSellerUploadBlockReason({ code: 0, data: { hasImageSpace: 0, usedSizeStr: 800.51, allowSizeStr: 800 } }),
    "BigSeller 素材中心空间不足（已用 800.51 MB / 额度 800 MB）"
  );
  assert.equal(bigSellerUploadBlockReason({ code: 0, data: { hasImageSpace: 1 } }), "");
  assert.equal(isNonRetryableBigSellerError(new Error("BigSeller blocked image upload: 素材中心空间不足")), true);
  assert.equal(isNonRetryableBigSellerError(new Error("temporary timeout")), false);
});

test("save resume skips jobs already recorded in the checkpoint", () => {
  const jobs = [
    { name: "store 4", editUrl: "https://example.test/edit/4" },
    { name: "store 5", editUrl: "https://example.test/edit/5" },
    { name: "store 6", editUrl: "https://example.test/edit/6" }
  ];
  const progress = {
    completedJobs: [
      { key: "https://example.test/edit/4" },
      "https://example.test/edit/6"
    ]
  };

  assert.deepEqual(pendingSaveJobs(jobs, progress), [jobs[1]]);
});

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

test("chooses a product-name dropdown decorated with BigSeller icon-font text", () => {
  const inputBox = { x: 161, y: 22, width: 359, height: 32 };
  const candidates = [
    { index: 4, text: "产品名称 \uE6DF", box: { x: 62, y: 22, width: 99, height: 32 } },
    { index: 18, text: "模糊搜索", box: { x: 525, y: 22, width: 70, height: 32 } }
  ];

  assert.deepEqual(chooseSearchModeTrigger(inputBox, candidates), candidates[0]);
});

test("uses the area immediately left of the input when BigSeller hides the dropdown text", () => {
  assert.deepEqual(
    fallbackSearchModeTriggerBox({ x: 161, y: 22, width: 359, height: 32 }),
    { x: 60.48, y: 22, width: 100.52, height: 32 }
  );
  assert.deepEqual(
    fallbackSearchModeTriggerBox({ x: 570, y: 516, width: 433, height: 39 }),
    { x: 448.76, y: 516, width: 121.24, height: 39 }
  );
});

test("accepts only valid BigSeller edit URLs", () => {
  const baseUrl = "https://www.bigseller.com/web/listing/shopee/active";
  assert.equal(
    resolveEditUrlCandidate("/web/listing/shopee/edit/123", baseUrl),
    "https://www.bigseller.com/web/listing/shopee/edit/123"
  );
  assert.equal(
    resolveEditUrlCandidate("https://www.bigseller.pro/web/listing/shopee/active/edit/1025545137.htm?bsStatus=4", baseUrl),
    "https://www.bigseller.pro/web/listing/shopee/active/edit/1025545137.htm?bsStatus=4"
  );
  assert.equal(resolveEditUrlCandidate("", baseUrl), "");
  assert.equal(resolveEditUrlCandidate("javascript:void(0)", baseUrl), "");
  assert.equal(resolveEditUrlCandidate("/web/listing/shopee/active", baseUrl), "");
});

test("recognizes SKU search mode exactly", () => {
  assert.equal(isSkuSearchModeText("SKU"), true);
  assert.equal(isSkuSearchModeText(" sku "), true);
  assert.equal(isSkuSearchModeText("SKU \uE6DF"), true);
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

test("source search tries active SKU, sold-out SKU, active Item ID, then sold-out Item ID", () => {
  const attempts = buildSourceSearchAttempts({
    skus: ["XL86301"],
    itemIds: ["53765401701"]
  });

  assert.deepEqual(attempts, [
    { mode: "SKU", values: ["XL86301"], soldOut: false },
    { mode: "SKU", values: ["XL86301"], soldOut: true },
    { mode: "Item ID", values: ["53765401701"], soldOut: false },
    { mode: "Item ID", values: ["53765401701"], soldOut: true }
  ]);
});

test("numeric source SKU input is also tried as sold-out Item ID", () => {
  const attempts = buildSourceSearchAttempts({
    skus: ["47815413330"]
  });

  assert.deepEqual(attempts, [
    { mode: "SKU", values: ["47815413330"], soldOut: false },
    { mode: "SKU", values: ["47815413330"], soldOut: true },
    { mode: "Item ID", values: ["47815413330"], soldOut: false },
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
