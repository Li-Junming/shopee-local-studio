import assert from "node:assert/strict";
import test from "node:test";
import { chooseCopyDialogStoreCandidate, identifyStore, storeMatchesText } from "../src/stores.js";
import { buildCopyDraftPlan, findDraftRowIndex, findSourceRowIndex, selectCopyDialogStores } from "../src/fill-drafts.js";
import { STORE_DEFINITIONS, buildBigSellerStoreMap } from "../../shopee_local_studio/src/core.js";

const warehouse = (n) => ({ match: `陈--平政--${n}店`, folder: `store_warehouse_2_${n}` });
const hcm = (n) => ({ match: `陈--胡志明--${n}店`, folder: `store_${n}_fixture` });
const box = (text, x = 10, checked = false) => ({ text, x, y: 20, width: 16, height: 16, hasCheckbox: true, checked });

test("all ten new remarks and legacy remarks resolve to the same original store folders", () => {
  const map = buildBigSellerStoreMap(STORE_DEFINITIONS.map((store) => store.id));
  const folders = ["store_4_skinora_care", "store_5_skinora_fresh", "store_6_skinora_luxe", "store_7_skinora", "store_8_skinora_beauty", "store_9_elora_skin", "store_warehouse_2_1", "store_warehouse_2_2", "store_warehouse_2_3", "store_warehouse_2_4"];
  assert.deepEqual(map.map((store) => store.folder), folders);
  assert.deepEqual(STORE_DEFINITIONS.map((store) => store.id), ["4", "5", "6", "7", "8", "9", "2仓1", "2仓2", "2仓3", "2仓4"]);
  for (const store of STORE_DEFINITIONS) {
    const number = store.id.replace("2仓", "");
    const legacy = store.id.startsWith("2仓") ? `姐夫-2仓${number}店（胡-2）` : `姐夫 ${number}店（胡-1）`;
    assert.equal(identifyStore(store.label, map).folder, store.folder);
    assert.equal(identifyStore(legacy, map).folder, store.folder);
    assert.equal(storeMatchesText(store.label, legacy), true);
  }
});

test("region plus full store number ignores changed prefixes, separators and full-width digits", () => {
  assert.equal(storeMatchesText("新备注 — 平政 — １ 店", warehouse(1)), true);
  assert.equal(storeMatchesText("其他前缀_胡志明_４店", hcm(4)), true);
  assert.equal(storeMatchesText("陈--平政--11店", warehouse(1)), false);
  assert.equal(storeMatchesText("陈--胡志明--14店", hcm(4)), false);
  assert.equal(storeMatchesText("陈--平政--4店", hcm(4)), false);
  assert.equal(storeMatchesText("陈--胡志明--4店", warehouse(4)), false);
  assert.equal(storeMatchesText("别的地区1店", warehouse(1)), false);
  assert.equal(storeMatchesText("姐夫-2仓11店（胡-2）", warehouse(1)), false);
});

test("the source 1 store is never confused with warehouse 1 or store 11", async () => {
  const rows = ["SKU001 陈--平政--1店", "SKU001 陈--胡志明--11店", "SKU001 陈--胡志明--1店"];
  assert.equal(await findSourceRowIndex({ evaluate: async () => rows }, ["SKU001"], "1店"), 2);
  assert.equal(await findSourceRowIndex({ evaluate: async () => rows.slice(0, 2) }, ["SKU001"], "1店"), -1);
});

test("existing renamed drafts are skipped while other stores and other SKUs are not", async () => {
  const rows = ["SKU001 陈--平政--1店", "SKU001 陈--胡志明--4店", "SKU999 陈--平政--2店"];
  const plan = buildCopyDraftPlan({ draftRowTexts: rows, skus: ["SKU001"], storeMap: [warehouse(1), warehouse(2), hcm(4)] });
  assert.deepEqual(plan.skipped.map((s) => s.match), [warehouse(1).match, hcm(4).match]);
  assert.deepEqual(plan.targets.map((s) => s.match), [warehouse(2).match]);
  assert.equal(await findDraftRowIndex({ evaluate: async () => rows }, ["SKU001"], { match: "姐夫-2仓1店（胡-2）" }), 0);
  assert.equal(await findDraftRowIndex({ evaluate: async () => rows }, ["SKU001"], warehouse(2)), -1);
});

test("explicit wrong or ambiguous page shops cannot fall back to another shop's job name", () => {
  assert.throws(() => identifyStore("陈--胡志明--1店", [warehouse(1)], "product - 陈--平政--1店"), /No configured store/);
  assert.throws(() => identifyStore("陈--平政--1店 陈--平政--2店", [warehouse(1), warehouse(2)], "陈--平政--1店"), /Ambiguous/);
  assert.equal(identifyStore("Product editor without a shop label", [warehouse(1)], "product - 陈--平政--1店").folder, "store_warehouse_2_1");
});

test("copy selection rejects ambiguous controls and non-checkbox text", () => {
  assert.throws(() => chooseCopyDialogStoreCandidate([box("陈--平政--1店"), box("陈--平政--1店", 100)], warehouse(1)), /Ambiguous/);
  assert.equal(chooseCopyDialogStoreCandidate([{ ...box("陈--平政--1店"), hasCheckbox: false }], warehouse(1)), null);
  assert.equal(chooseCopyDialogStoreCandidate([box("陈--平政--1店 陈--平政--2店")], warehouse(1)), null);
  assert.equal(chooseCopyDialogStoreCandidate([{ ...box("陈--平政--1店"), disabled: true }], warehouse(1)), null);
});

test("current full shop remarks take priority over another owner's same region and number", () => {
  const others = [box("雪儿胡志明4店", 20), box("袁鹏胡志明4店", 40)];
  const wanted = box("陈 -- 胡志明 -- ４店", 60);
  assert.equal(chooseCopyDialogStoreCandidate([...others, wanted], hcm(4)), wanted);
  assert.equal(chooseCopyDialogStoreCandidate([wanted, ...others], hcm(4)), wanted);
  assert.throws(() => chooseCopyDialogStoreCandidate(others, hcm(4)), /Ambiguous/);
  const disabled = { ...wanted, disabled: true };
  assert.equal(chooseCopyDialogStoreCandidate([others[0], disabled], hcm(4)), null);
  assert.throws(() => chooseCopyDialogStoreCandidate([wanted, box(wanted.text, 80)], hcm(4)), /Ambiguous/);
});

test("explicit aliases precede regional fallback while unique legacy names still work", () => {
  const alias = box("旧陈店铺4", 60);
  assert.equal(chooseCopyDialogStoreCandidate([box("雪儿胡志明4店"), alias], { ...hcm(4), aliases: ["旧陈店铺4"] }), alias);
  const legacy = box("姐夫 4店（胡-1）");
  assert.equal(chooseCopyDialogStoreCandidate([legacy], hcm(4)), legacy);
});

function fakeDialogPage(candidates) {
  const calls = [];
  const state = [...new Map(candidates.map((candidate) => {
    const key = [candidate.x, candidate.y, candidate.width, candidate.height].join(":");
    return [key, { ...candidate, key }];
  })).values()];
  const dialog = {
    waitFor: async () => {}, evaluate: async () => state.map((item) => ({ ...item })),
    locator: (selector) => {
      const key = selector.match(/="([^"]+)"/)[1];
      const item = state.find((candidate) => candidate.key === key);
      return {
        isChecked: async () => item.checked,
        scrollIntoViewIfNeeded: async () => calls.push(["scroll", item.text]),
        click: async () => { item.checked = !item.checked; calls.push(["click", item.text]); }
      };
    }
  };
  return {
    calls,
    locator: () => ({ filter: () => ({ last: () => dialog }) }),
    evaluate: async () => candidates,
    mouse: { click: async (...point) => calls.push(point) },
    waitForTimeout: async () => {}
  };
}

test("copy window accepts new remarks, deduplicates wrappers, and preserves checked stores", async () => {
  const candidates = [box("陈--平政--1店", 10, true), box("陈--平政--1店", 10, true), box("陈--平政--2店", 100), box("陈--胡志明--1店", 200)];
  const page = fakeDialogPage(candidates);
  assert.deepEqual(await selectCopyDialogStores(page, [warehouse(1), warehouse(2)]), [warehouse(1).match, warehouse(2).match]);
  assert.deepEqual(page.calls, [["scroll", "陈--平政--2店"], ["click", "陈--平政--2店"]]);
});

test("missing copy targets are reported before changing any checkbox", async () => {
  const page = fakeDialogPage([box("陈--平政--1店")]);
  await assert.rejects(selectCopyDialogStores(page, [warehouse(1), warehouse(2)]), /Visible stores: 陈--平政--1店/);
  assert.deepEqual(page.calls, []);
});
