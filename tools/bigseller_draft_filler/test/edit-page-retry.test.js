import assert from "node:assert/strict";
import test from "node:test";

import { openEditPageWithRetry } from "../src/fill-drafts.js";

test("openEditPageWithRetry reopens edit page when body stays hidden", async () => {
  const events = [];
  const pages = [
    makePage(events, new Error("locator.waitFor: Timeout 30000ms exceeded\n- waiting for locator('body') to be visible")),
    makePage(events, "ready body text")
  ];
  const context = {
    async newPage() {
      events.push("newPage");
      return pages.shift();
    }
  };

  const result = await openEditPageWithRetry(context, "https://example.test/edit/1", {
    logger: { log: (line) => events.push(line) }
  });

  assert.equal(result.pageText, "ready body text");
  assert.equal(result.attempt, 2);
  assert.deepEqual(events.filter((event) => event === "newPage"), ["newPage", "newPage"]);
  assert.equal(events.includes("closed"), true);
  assert.equal(events.some((event) => event.includes("retrying edit page")), true);
});

function makePage(events, bodyResult) {
  return {
    async goto(url) {
      events.push(`goto ${url}`);
    },
    async waitForLoadState() {
      events.push("networkidle");
    },
    locator() {
      return {
        async waitFor() {
          if (bodyResult instanceof Error) throw bodyResult;
        },
        async innerText() {
          if (bodyResult instanceof Error) throw bodyResult;
          return bodyResult;
        }
      };
    },
    async close() {
      events.push("closed");
    }
  };
}
