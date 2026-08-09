import test from "node:test";
import assert from "node:assert/strict";
import { normalizeConfig } from "../src/config.js";

test("normalizes defaults and resolves job output paths", () => {
  const config = withoutOpenAiBaseUrl(() => normalizeConfig({
    outputDir: "outputs/demo",
    jobs: [
      { name: "main", prompt: "make poster", out: "store_7/01_main.png" },
      { name: "edit", prompt: "edit poster", images: ["a.png"], out: "store_7/02_effect.png" }
    ]
  }, "C:/work/jobs.json"));

  assert.equal(config.model, "gpt-image-2");
  assert.equal(config.baseUrl, "https://api.openai.com/v1");
  assert.equal(config.size, "1024x1024");
  assert.equal(config.outputSize, 800);
  assert.equal(config.concurrency, 2);
  assert.equal(config.maxRetryableFailures, 3);
  assert.equal(config.jobs[0].endpoint, "generations");
  assert.equal(config.jobs[1].endpoint, "edits");
  assert.match(config.jobs[0].outputPath, /outputs[\\/]demo[\\/]store_7[\\/]01_main\.png$/);
});

test("rejects jobs without prompts or output filenames", () => {
  assert.throws(() => normalizeConfig({ jobs: [{ name: "bad" }] }, "C:/work/jobs.json"), /prompt/);
  assert.throws(() => normalizeConfig({ jobs: [{ prompt: "x" }] }, "C:/work/jobs.json"), /out/);
});

test("accepts a configured retryable failure circuit breaker", () => {
  const config = withoutOpenAiBaseUrl(() => normalizeConfig({
    maxRetryableFailures: 2,
    jobs: [{ prompt: "x", out: "a.png" }]
  }, "C:/work/jobs.json"));

  assert.equal(config.maxRetryableFailures, 2);
  assert.throws(() => normalizeConfig({
    maxRetryableFailures: 0,
    jobs: [{ prompt: "x", out: "a.png" }]
  }, "C:/work/jobs.json"), /maxRetryableFailures/);
});

test("accepts accidentally pasted markdown-style base URLs", () => {
  const config = withoutOpenAiBaseUrl(() => normalizeConfig({
    baseUrl: "[https://api.example.com/v1](https://api.example.com/v1)",
    jobs: [{ prompt: "x", out: "a.png" }]
  }, "C:/work/jobs.json"));

  assert.equal(config.baseUrl, "https://api.example.com/v1");
});

function withoutOpenAiBaseUrl(callback) {
  const previous = process.env.OPENAI_BASE_URL;
  delete process.env.OPENAI_BASE_URL;
  try {
    return callback();
  } finally {
    if (previous === undefined) delete process.env.OPENAI_BASE_URL;
    else process.env.OPENAI_BASE_URL = previous;
  }
}
