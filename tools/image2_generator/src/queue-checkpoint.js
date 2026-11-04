import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";

// Store identifiers and counters only: never prompts, credentials or response bodies.
export async function openQueueCheckpoint(jobs, options = {}) {
  const filePath = options.filePath;
  const sessionId = options.sessionId || randomUUID();
  const maxAttempts = options.maxAttempts ?? 2;
  const keyFor = (job) => job.outputPath;
  const fingerprint = (job) => createHash("sha256").update(JSON.stringify({
    output: job.outputPath, model: job.model, endpoint: job.endpoint,
    prompt: job.prompt, images: job.images, size: job.size, quality: job.quality,
    outputFormat: job.outputFormat, background: job.background, n: job.n,
    imageField: job.imageField
  })).digest("hex");
  let previous = null;
  try {
    previous = JSON.parse(await fs.readFile(filePath, "utf8"));
    if (previous.version !== 1 || !Array.isArray(previous.order) || !previous.jobs) {
      throw new Error("Unsupported image queue checkpoint format");
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const records = {};
  for (const job of jobs) {
    const key = keyFor(job);
    if (Object.hasOwn(records, key)) throw new Error(`Duplicate image output: ${key}`);
    const hash = fingerprint(job);
    const prior = previous?.jobs[key];
    records[key] = prior?.fingerprint === hash && previous.sessionId === sessionId && prior.status !== "done"
      ? { ...prior }
      : { fingerprint: hash, attempts: 0, status: "pending" };
  }
  const order = [...new Set([...(previous?.order || []), ...jobs.map(keyFor)])]
    .filter((key) => Object.hasOwn(records, key));
  const state = { version: 1, sessionId, order, jobs: records };
  let writes = Promise.resolve();
  const save = () => {
    const json = `${JSON.stringify(state, null, 2)}\n`;
    writes = writes.then(async () => {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      const temp = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
      await fs.writeFile(temp, json, "utf8");
      await fs.rename(temp, filePath);
    });
    return writes;
  };
  const rotate = (key) => {
    state.order = state.order.filter((item) => item !== key);
    state.order.push(key);
  };
  const eligible = (job) => {
    const record = records[keyFor(job)];
    return record.status !== "done" && record.status !== "blocked" && record.attempts < maxAttempts;
  };
  await save();
  return {
    orderedJobs: () => state.order.map((key) => jobs.find((job) => keyFor(job) === key)),
    eligible,
    async start(job) {
      if (!eligible(job)) {
        const error = new Error("IMAGE_QUEUE_EXHAUSTED: image attempt budget reached; existing outputs were preserved.");
        error.code = "IMAGE_QUEUE_EXHAUSTED";
        throw error;
      }
      const key = keyFor(job);
      records[key].attempts += 1;
      records[key].status = "active";
      rotate(key); // A killed process must also resume after untouched work.
      await save();
    },
    async complete(job) {
      records[keyFor(job)].status = "done";
      await save();
    },
    async fail(job, error, retryable) {
      const key = keyFor(job);
      records[key].status = retryable ? "pending" : "blocked";
      records[key].lastFailure = {
        code: String(error?.code || "IMAGE_REQUEST_FAILED").slice(0, 80),
        phase: String(error?.phase || "unknown").slice(0, 40),
        at: new Date().toISOString()
      };
      rotate(key);
      await save();
    }
  };
}
