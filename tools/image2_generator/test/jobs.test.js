import test from "node:test";
import assert from "node:assert/strict";
import { shouldSkipJobOutput } from "../src/jobs.js";

test("skips existing non-empty image output files", async () => {
  const fsImpl = {
    stat: async () => ({ isFile: () => true, size: 12 })
  };

  assert.equal(await shouldSkipJobOutput("out.png", fsImpl), true);
});

test("does not skip existing image output files when overwrite is enabled", async () => {
  const fsImpl = {
    stat: async () => ({ isFile: () => true, size: 12 })
  };

  assert.equal(await shouldSkipJobOutput("out.png", fsImpl, { overwrite: true }), false);
});

test("does not skip missing or empty image output files", async () => {
  const missingFs = {
    stat: async () => {
      const error = new Error("missing");
      error.code = "ENOENT";
      throw error;
    }
  };
  const emptyFs = {
    stat: async () => ({ isFile: () => true, size: 0 })
  };

  assert.equal(await shouldSkipJobOutput("missing.png", missingFs), false);
  assert.equal(await shouldSkipJobOutput("empty.png", emptyFs), false);
});
