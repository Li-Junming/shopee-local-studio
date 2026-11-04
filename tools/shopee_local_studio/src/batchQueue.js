const BATCH_LIMIT = 50;

export function parseBatchInputs(value) {
  const items = String(value || "")
    .split(/\r?\n|[,，;；]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (!items.length) throw new Error("请至少输入一个 Item ID/SKU。");
  if (items.length > BATCH_LIMIT) throw new Error(`一次最多处理 ${BATCH_LIMIT} 个商品。`);
  return items;
}

export function createBatchQueueRecord({ inputs, targetStores, notes = "", now = new Date().toISOString() }) {
  return {
    version: 1,
    status: "ready",
    targetStores: [...targetStores],
    notes: String(notes || ""),
    currentIndex: 0,
    lastMessage: "批量队列已创建，等待开始。",
    createdAt: now,
    updatedAt: now,
    items: inputs.map((input, index) => ({
      index,
      input,
      status: "waiting",
      taskId: "",
      error: "",
      startedAt: "",
      finishedAt: ""
    }))
  };
}

export function batchQueueCounts(queue) {
  const items = Array.isArray(queue?.items) ? queue.items : [];
  return {
    total: items.length,
    done: items.filter((item) => item.status === "done").length,
    skipped: items.filter((item) => item.status === "skipped").length,
    failed: items.filter((item) => ["failed", "needs_confirmation"].includes(item.status)).length,
    waiting: items.filter((item) => ["waiting", "running"].includes(item.status)).length
  };
}

export function currentBatchItem(queue) {
  const items = Array.isArray(queue?.items) ? queue.items : [];
  const preferred = items[Number(queue?.currentIndex || 0)];
  if (preferred && !["done", "skipped"].includes(preferred.status)) return preferred;
  return items.find((item) => !["done", "skipped"].includes(item.status)) || null;
}
