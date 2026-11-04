import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { writeJsonAtomic, readJsonAtomic } from "../src/taskRecovery.js";

test("task polling and writes share one queue and never overlap file handles", async (t) => {
  const { file } = await fixture(t);
  const readFile = fs.readFile;
  const rename = fs.rename;
  let readers = 0;
  t.mock.method(fs, "readFile", async (...args) => {
    readers++;
    try {
      await new Promise(resolve => setTimeout(resolve, 2));
      return await readFile(...args);
    } finally { readers--; }
  });
  t.mock.method(fs, "rename", async (...args) => {
    assert.equal(readers, 0, "Windows replacement must not overlap task polling");
    return rename(...args);
  });
  const operations = [];
  for (let sequence = 0; sequence < 30; sequence++) {
    operations.push(readJsonAtomic(file));
    operations.push(writeJsonAtomic(file, { sequence }));
  }
  await Promise.all(operations);
  assert.equal((await readJsonAtomic(file)).sequence, 29);
});

async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "studio-atomic-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, "task.json");
  await fs.writeFile(file, JSON.stringify({ status: "created" }));
  return { dir, file };
}

test("transient Windows replacement failures preserve old JSON until success", async (t) => {
  const { dir, file } = await fixture(t);
  const rename = fs.rename;
  let attempts = 0;
  t.mock.method(fs, "rename", async (...args) => {
    attempts++;
    if (attempts <= 3) {
      assert.deepEqual(JSON.parse(await fs.readFile(file, "utf8")), { status: "created" });
      throw Object.assign(new Error("Windows sharing violation"), { code: ["EPERM", "EACCES", "EBUSY"][attempts - 1] });
    }
    return rename(...args);
  });
  await writeJsonAtomic(file, { status: "fetching_source_images" });
  assert.equal(attempts, 4);
  assert.equal(JSON.parse(await fs.readFile(file, "utf8")).status, "fetching_source_images");
  assert.deepEqual(await fs.readdir(dir), ["task.json"]);
});

test("permanent denial is bounded, preserves original and allows the next save", async (t) => {
  const { dir, file } = await fixture(t);
  const denied = t.mock.method(fs, "rename", async () => {
    throw Object.assign(new Error("Access denied"), { code: "EPERM" });
  });
  await assert.rejects(writeJsonAtomic(file, { status: "changed" }), { code: "EPERM" });
  assert.equal(denied.mock.callCount(), 8);
  assert.equal(JSON.parse(await fs.readFile(file, "utf8")).status, "created");
  assert.deepEqual(await fs.readdir(dir), ["task.json"]);
  denied.mock.restore();
  await writeJsonAtomic(file, { status: "recovered" });
  assert.equal(JSON.parse(await fs.readFile(file, "utf8")).status, "recovered");
});

test("concurrent writes commit in submission order using submission snapshots", async (t) => {
  const { dir, file } = await fixture(t);
  const rename = fs.rename;
  const committed = [];
  let active = 0;
  t.mock.method(fs, "rename", async (...args) => {
    active++;
    assert.equal(active, 1);
    committed.push(JSON.parse(await fs.readFile(args[0], "utf8")).sequence);
    await rename(...args);
    active--;
  });
  const record = { sequence: 0 };
  const writes = [];
  for (let sequence = 0; sequence < 30; sequence++) {
    record.sequence = sequence;
    writes.push(writeJsonAtomic(file, record));
  }
  await Promise.all(writes);
  assert.deepEqual(committed, Array.from({ length: 30 }, (_, i) => i));
  assert.equal(JSON.parse(await fs.readFile(file, "utf8")).sequence, 29);
  assert.deepEqual(await fs.readdir(dir), ["task.json"]);
});

test("non-transient errors fail immediately without destroying saved metadata", async (t) => {
  const { file } = await fixture(t);
  const denied = t.mock.method(fs, "rename", async () => {
    throw Object.assign(new Error("Disk error"), { code: "EIO" });
  });
  await assert.rejects(writeJsonAtomic(file, { status: "changed" }), { code: "EIO" });
  assert.equal(denied.mock.callCount(), 1);
  assert.equal(JSON.parse(await fs.readFile(file, "utf8")).status, "created");
});
