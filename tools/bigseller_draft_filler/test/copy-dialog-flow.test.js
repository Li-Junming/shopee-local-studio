import assert from "node:assert/strict";
import test from "node:test";
import { chooseCopyToDraftControl, clickCopyToDraftFromRow, selectCopyDialogStores, waitForCopyDraftDialog } from "../src/fill-drafts.js";

const rowBox = { x: 0, y: 100, width: 2000, height: 120 };
const control = (index, text, x, extra = {}) => ({ index, text, visible: true, box: { x, y: 110, width: 20, height: 20 }, ...extra });

test("sold-out row rejects SKU/Item-ID clipboard icons even when labelled copy", () => {
  const candidates = [
    control(0, "复制", 1100, { className: "sku-copy" }),
    control(1, "复制 SKU", 1800),
    control(2, "Copy Item ID", 1900),
    control(3, "复制到草稿", 1700, { className: "action_btn" })
  ];
  assert.equal(chooseCopyToDraftControl(candidates, rowBox)?.index, 3);
  assert.equal(chooseCopyToDraftControl(candidates.slice(0, 3), rowBox), null);
  assert.equal(chooseCopyToDraftControl([control(0, "复制", 1100)], rowBox), null);
  assert.equal(chooseCopyToDraftControl([control(0, "复制", 1500)], rowBox), null);
});

test("sold-out row action honors disabled/hidden controls and explicit draft semantics", () => {
  const candidates = [control(0, "复制到草稿", 1900, { disabled: true }), control(1, "复制到草稿", 1850, { visible: false }), control(2, "复制到草稿", 400)];
  assert.equal(chooseCopyToDraftControl(candidates, rowBox)?.index, 2);
});

function rowPage(controls, { failClick = false } = {}) {
  const calls = [];
  const button = {
    scrollIntoViewIfNeeded: async (options) => calls.push(["scroll", options]),
    click: async (options) => { calls.push(["click", options]); if (failClick) throw new Error("intercepted by overlay"); }
  };
  let evaluation = 0;
  return {
    calls,
    evaluate: async () => ++evaluation === 1
      ? { rowBox, rowSelector: "tr.product_native_row", rowLocatorIndex: 0, controls }
      : false,
    locator: (selector) => {
      calls.push(["row", selector]);
      return { nth: (index) => { calls.push(["rowIndex", index]); return { locator: () => ({ nth: (index) => { calls.push(["controlIndex", index]); return button; } }) }; } };
    }
  };
}

test("sold-out copy action scrolls and uses exactly one actionability-checked click", async () => {
  const page = rowPage([control(4, "复制到草稿", 1850)]);
  await clickCopyToDraftFromRow(page, 0);
  assert.deepEqual(page.calls.filter((item) => item[0] === "controlIndex"), [["controlIndex", 4]]);
  assert.equal(page.calls.filter((item) => item[0] === "click").length, 1);
  assert.deepEqual(page.calls.at(-1), ["click", { timeout: 10000 }]);
});

test("unsafe icons and blocked clicks stop without forcing or repeating the action", async () => {
  const unsafe = rowPage([control(0, "复制 SKU", 1850)]);
  await assert.rejects(clickCopyToDraftFromRow(unsafe, 0), /safe copy-to-draft action/);
  assert.deepEqual(unsafe.calls, []);
  const blocked = rowPage([control(0, "复制到草稿", 1850)], { failClick: true });
  await assert.rejects(clickCopyToDraftFromRow(blocked, 0), /intercepted/);
  assert.equal(blocked.calls.filter((item) => item[0] === "click").length, 1);
});

function dialogPage({ failWait = false } = {}) {
  const calls = [];
  const dialog = {
    // Must not be queried before waiting: a late popup initially has no nodes.
    count: async () => { throw new Error("premature count check"); },
    waitFor: async (options) => { calls.push(["wait", options]); if (failWait) throw new Error("timeout"); }
  };
  return {
    calls, dialog,
    locator: (selector) => ({ filter: ({ hasText }) => {
      assert.match(selector, /:visible/);
      assert.equal(hasText.test("SHOPEE"), true);
      return { last: () => dialog };
    } }),
    evaluate: async () => [],
    mouse: { click: async () => calls.push(["selected checkbox"]) }
  };
}

test("a popup absent at click time is awaited rather than immediately rejected", async () => {
  const page = dialogPage();
  assert.equal(await waitForCopyDraftDialog(page), page.dialog);
  assert.deepEqual(page.calls, [["wait", { state: "visible", timeout: 15000 }]]);
});

test("popup timeout is bounded and never selects shops or submits copy", async () => {
  const page = dialogPage({ failWait: true });
  await assert.rejects(selectCopyDialogStores(page, [{ match: "陈--平政--1店" }]), /after waiting 15s/);
  assert.deepEqual(page.calls, [["wait", { state: "visible", timeout: 15000 }]]);
});
