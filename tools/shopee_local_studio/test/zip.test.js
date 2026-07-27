import assert from "node:assert/strict";
import test from "node:test";
import { createZipBuffer } from "../src/zip.js";

test("createZipBuffer writes stored zip entries with file names", () => {
  const zip = createZipBuffer([
    { name: "store_7_skinora/01_product.png", data: Buffer.from("png") },
    { name: "store_7_skinora/title.txt", data: Buffer.from("Title") }
  ]);

  assert.equal(zip.readUInt32LE(0), 0x04034b50);
  assert.equal(zip.includes(Buffer.from("store_7_skinora/01_product.png")), true);
  assert.equal(zip.includes(Buffer.from("store_7_skinora/title.txt")), true);
  assert.equal(zip.includes(Buffer.from("PK\u0005\u0006", "binary")), true);
});

test("createZipBuffer rejects unsafe entry names", () => {
  assert.throws(() => createZipBuffer([
    { name: "../secret.txt", data: Buffer.from("x") }
  ]), /Unsafe zip entry name/);
});
