import assert from "node:assert/strict";
import test from "node:test";

import { identifyStore } from "../src/stores.js";

const storeMap = [
  { match: "姐夫 7店", folder: "store_7_skinora" },
  { match: "姐夫8店", folder: "store_8_skinora_beauty" },
  { match: "姐夫9店", folder: "store_9_elora_skin" }
];

test("matches store names even when BigSeller spacing differs", () => {
  assert.equal(identifyStore("店铺 * 姐夫 7店（胡） 基本信息", storeMap).folder, "store_7_skinora");
  assert.equal(identifyStore("当前店铺：姐夫8店（胡）", storeMap).folder, "store_8_skinora_beauty");
  assert.equal(identifyStore("Shopee > 编辑产品 姐夫9店（胡）", storeMap).folder, "store_9_elora_skin");
});

test("throws a useful error when the store cannot be matched", () => {
  assert.throws(
    () => identifyStore("店铺：姐夫5店（胡）", storeMap),
    /No configured store matched/
  );
});
