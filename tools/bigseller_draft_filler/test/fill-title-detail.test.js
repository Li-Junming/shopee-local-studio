import assert from "node:assert/strict";
import test from "node:test";

import {
  fillTitleAndDetail,
  formatAssetSummary,
  shouldSkipImageUpload,
  waitForSaveFeedback
} from "../src/fill-drafts.js";

test("fillTitleAndDetail waits for BigSeller title input to mount", async () => {
  const events = [];
  let mounted = false;
  const page = {
    async waitForFunction() {
      events.push("waitForFunction");
      mounted = true;
    },
    locator(selector) {
      if (selector === 'input[type="text"]:visible') {
        return {
          async count() {
            return mounted ? 1 : 0;
          },
          nth(index) {
            return {
              async fill(value) {
                events.push(`input:${index}:${value}`);
              }
            };
          }
        };
      }
      if (selector === "textarea:visible") {
        return {
          async count() {
            return 1;
          },
          nth(index) {
            return {
              async fill(value) {
                events.push(`textarea:${index}:${value}`);
              }
            };
          }
        };
      }
      throw new Error(`Unexpected selector: ${selector}`);
    }
  };

  await fillTitleAndDetail(page, { title: "New title", detail: "New detail" });

  assert.deepEqual(events, [
    "waitForFunction",
    "waitForFunction",
    "input:0:New title",
    "textarea:0:New detail"
  ]);
});

test("shouldSkipImageUpload allows config or job level text-only saves", () => {
  assert.equal(shouldSkipImageUpload({ skipImages: true }, {}), true);
  assert.equal(shouldSkipImageUpload({ skipImages: false }, { skipImages: true }), true);
  assert.equal(shouldSkipImageUpload({ skipImages: true }, { skipImages: false }), false);
  assert.equal(shouldSkipImageUpload({}, {}), false);
});

test("formatAssetSummary reports styled title by visible characters", () => {
  const summary = formatAssetSummary({
    title: "𝕊𝔼ℙℍ𝕆ℝ𝔸 𝐎𝐮𝐭𝐫𝐚𝐠𝐞𝐨𝐮𝐬 𝐏𝐥𝐮𝐦𝐩 Son Bóng Môi",
    detail: "abc",
    images: ["one.png", "two.png"]
  });

  assert.match(summary, /titleVisible=37 chars/);
  assert.match(summary, /titleJs=56 chars/);
  assert.match(summary, /detail=3 chars/);
  assert.match(summary, /images=2/);
});

test("waitForSaveFeedback waits for a success hint before falling back to a short settle", async () => {
  const events = [];
  const page = {
    async waitForFunction(callback) {
      events.push("waitForFunction");
      assert.equal(typeof callback, "function");
      return true;
    },
    async waitForTimeout(ms) {
      events.push(`waitForTimeout:${ms}`);
    }
  };

  const result = await waitForSaveFeedback(page);

  assert.equal(result, "confirmed");
  assert.deepEqual(events, ["waitForFunction", "waitForTimeout:500"]);
});
