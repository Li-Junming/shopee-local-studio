import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { writeImage } from "../src/postprocess.js";

test("writes image bytes and creates parent directories", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "image2-generator-"));
  const out = path.join(dir, "nested", "image.png");
  await writeImage(Buffer.from("abc"), out);
  assert.equal(await fs.readFile(out, "utf8"), "abc");
});
