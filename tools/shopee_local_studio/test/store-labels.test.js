import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const coreSource = readFileSync(new URL("../src/core.js", import.meta.url), "utf8");

test("STORE_DEFINITIONS uses the BigSeller store names as display labels", () => {
  const expectedLabels = [
    "陈--胡志明--4店",
    "陈--胡志明--5店",
    "陈--胡志明--6店",
    "陈--胡志明--7店",
    "陈--胡志明--8店",
    "陈--胡志明--9店",
    "陈--平政--1店",
    "陈--平政--2店",
    "陈--平政--3店",
    "陈--平政--4店",
  ];

  for (const label of expectedLabels) {
    assert.match(coreSource, new RegExp(`label:\\s*["']${label}["']`));
  }
});
