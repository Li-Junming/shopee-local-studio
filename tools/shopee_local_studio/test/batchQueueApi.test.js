import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { once } from "node:events";

test("batch queue API persists a ready queue without starting a product task", async () => {
  const queuePath = path.join(os.tmpdir(), `shopee-batch-queue-${process.pid}-${Date.now()}.json`);
  process.env.PORT = "0";
  process.env.BATCH_QUEUE_PATH = queuePath;
  const isolatedData = await fs.mkdtemp(path.join(os.tmpdir(), "shopee-batch-api-data-"));
  process.env.STUDIO_DATA_ROOT = isolatedData;
  const { server } = await import(`../src/server.js?batch-api-test=${Date.now()}`);
  if (!server.listening) await once(server, "listening");
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const createResponse = await fetch(`${baseUrl}/api/batch-queue`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: "ITEM-A\nITEM-B",
        targetStores: ["4", "5"],
        start: false
      })
    });
    assert.equal(createResponse.status, 201);
    const created = await createResponse.json();
    assert.equal(created.queue.status, "ready");
    assert.deepEqual(created.queue.items.map((item) => item.input), ["ITEM-A", "ITEM-B"]);

    const readResponse = await fetch(`${baseUrl}/api/batch-queue`);
    const read = await readResponse.json();
    assert.equal(read.queue.counts.total, 2);
    assert.deepEqual(read.queue.targetStores, ["4", "5"]);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(queuePath, { force: true });
    await fs.rm(isolatedData, { recursive: true, force: true });
  }
});
