import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { callImageApi, isFatalImageError } from "../src/image2-client.js";
import { runAdaptivePool } from "../src/adaptive-pool.js";

test("real local HTTP upload emits request-body-sent evidence with no prompt, credentials or body", async (t) => {
  let id;
  const server = http.createServer((req, res) => {
    id = req.headers["x-client-request-id"];
    req.resume();
    req.on("end", () => { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ data: [{ b64_json: Buffer.from("fixture-png").toString("base64") }] })); });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => { server.closeAllConnections(); return new Promise((resolve) => server.close(resolve)); });
  const events = [];
  const bytes = await callImageApi({
    config: { baseUrl: `http://127.0.0.1:${server.address().port}/v1` },
    job: { endpoint: "generations", prompt: "private prompt", model: "unchanged-model" },
    apiKey: "private-key", onDiagnostic: (event) => events.push(event)
  });
  assert.equal(bytes.toString(), "fixture-png");
  assert.match(id, /^[a-f0-9-]{36}$/);
  assert.equal(events.every((event) => event.clientRequestId === id), true);
  assert.ok(events.some((event) => event.event === "request_created"));
  assert.ok(events.some((event) => event.event === "request_body_sent"));
  assert.doesNotMatch(JSON.stringify(events), /private prompt|private-key|Bearer|fixture-png/);
  const count = events.length;
  await fetch(`http://127.0.0.1:${server.address().port}/v1/images/generations`, { method: "POST", body: "unrelated" }).then((r) => r.text());
  assert.equal(events.length, count, "subscriptions must be removed after completion");
});

test("confirmed relay retries stop the remaining queue and request retries without altering the timeout", async () => {
  let requests = 0;
  let inspections = 0;
  const processed = [];
  const events = [];
  await assert.rejects(runAdaptivePool(["first", "second", "third"], {
    maxConcurrency: 1, fallbackConcurrency: 1, continueOnError: true,
    isFatal: isFatalImageError, isRetryable: () => true
  }, async (job) => {
    processed.push(job);
    await callImageApi({
      config: { baseUrl: "http://localhost:51257/v1" },
      job: { endpoint: "generations", model: "fixture", prompt: "fixture" }, apiKey: "fixture",
      timeoutMs: 20, maxAttempts: 3,
      fetchImpl: () => { requests++; return new Promise(() => {}); },
      relayInspector: async ({ model, endpoint, startedAtMs }) => {
        inspections++; assert.equal(model, "fixture"); assert.equal(endpoint, "generations"); assert.ok(startedAtMs > 0);
        return { requestId: "confirmed-relay-request", status: 499, attempts: [{ status: 504 }, { status: 504 }, { status: 499 }], confirmedHeaderTimeout: true };
      },
      onDiagnostic: (event) => events.push(event)
    });
  }), (error) => {
    assert.equal(error.code, "IMAGE_RELAY_UPSTREAM_TIMEOUT");
    assert.match(error.message, /final 499/);
    return true;
  });
  assert.deepEqual(processed, ["first"]); assert.equal(requests, 1); assert.equal(inspections, 1);
  assert.ok(events.some((event) => event.event === "relay_evidence"));
});

test("missing optional relay diagnostics cannot make an uncertain image safe to replay", async () => {
  for (const relayInspector of [async () => null, async () => { throw new Error("diagnostic database unavailable"); }]) {
    await assert.rejects(callImageApi({ config: { baseUrl: "http://localhost:51257/v1" },
      job: { endpoint: "generations", prompt: "fixture", model: "fixture" }, apiKey: "fixture", timeoutMs: 10,
      fetchImpl: () => new Promise(() => {}), relayInspector
    }), (error) => { assert.equal(error.code, "IMAGE_API_EXECUTION_UNCERTAIN"); assert.equal(isFatalImageError(error), true); return true; });
  }
});

test("an explicit relay 504 is also correlated and stops replay before the outer deadline", async () => {
  let requests = 0;
  await assert.rejects(callImageApi({
    config: { baseUrl: "http://localhost:51257/v1" },
    job: { endpoint: "generations", model: "fixture", prompt: "fixture" }, apiKey: "fixture", maxAttempts: 3,
    fetchImpl: async () => { requests++; return new Response(JSON.stringify({ error: { code: "upstream_connect_timeout", message: "Image upstream response headers timed out" } }), { status: 504 }); },
    relayInspector: async () => ({ requestId: "fixture-relay-504", status: 504,
      attempts: [{ status: 504 }, { status: 504 }], confirmedHeaderTimeout: true })
  }), (error) => {
    assert.equal(error.code, "IMAGE_RELAY_UPSTREAM_TIMEOUT");
    assert.match(error.message, /itself returned HTTP 504/);
    assert.doesNotMatch(error.message, /final 499/);
    return true;
  });
  assert.equal(requests, 1);
});
