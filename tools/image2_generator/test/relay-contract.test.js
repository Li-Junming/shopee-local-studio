import test from "node:test";
import assert from "node:assert/strict";
import { callImageApi, isFatalImageError, isRetryableImageError } from "../src/image2-client.js";

const job = { endpoint: "generations", model: "unchanged-image-model", prompt: "private fixture", size: "1024x1024", quality: "low", n: 1 };
const response = (status, code) => new Response(JSON.stringify({ error: { code, message: "fixture error" } }), { status });

test("only the local Cockpit image endpoint receives the bounded single-attempt contract", async () => {
  for (const baseUrl of ["http://127.0.0.1:51257/v1", "http://localhost:51257/v1", "https://relay.example/v1", "http://127.0.0.1:51260/v1"]) {
    const events = [];
    await callImageApi({ config: { baseUrl }, job, apiKey: "private-key", timeoutMs: 180000,
      onDiagnostic: (event) => events.push(event),
      fetchImpl: async (url, options) => {
        const local = baseUrl.includes(":51257/");
        assert.equal(options.headers["X-Cockpit-Image-Contract"], local ? "single-attempt-v1" : undefined);
        if (local) assert.ok(Number(options.headers["X-Cockpit-Image-Timeout-Ms"]) > 0 && Number(options.headers["X-Cockpit-Image-Timeout-Ms"]) <= 180000);
        else assert.equal(options.headers["X-Cockpit-Image-Timeout-Ms"], undefined);
        const body = JSON.parse(options.body);
        assert.equal(body.model, job.model); assert.equal(body.prompt, job.prompt);
        assert.equal(body.quality, "low"); assert.equal(body.n, 1);
        return new Response(JSON.stringify({ data: [{ b64_json: "AA==" }] }), { headers: { "X-Cockpit-Image-Contract": "single-attempt-v1" } });
      }
    });
    assert.doesNotMatch(JSON.stringify(events), /private-key|private fixture/);
    assert.equal(events.find(e => e.event === "headers").relayContract, baseUrl.includes(":51257/") ? "single-attempt-v1" : undefined);
  }
});

test("an uncertain result stops automatic retries but retains manual queue eligibility", async () => {
  for (const code of ["image_upstream_execution_uncertain", "upstream_connect_timeout"]) {
    let requests = 0;
    await assert.rejects(callImageApi({ config: { baseUrl: "http://localhost:51257/v1" }, job, apiKey: "fixture",
      maxAttempts: 3, relayInspector: async () => null,
      fetchImpl: async () => { requests++; return response(504, code); }
    }), error => {
      assert.equal(error.code, "IMAGE_API_EXECUTION_UNCERTAIN");
      assert.equal(isFatalImageError(error), true);
      assert.equal(isRetryableImageError(error), true);
      assert.match(error.message, /不代表上游一定没有执行/);
      return true;
    });
    assert.equal(requests, 1);
  }
});

test("the original deadline also protects an incomplete response body without replay", async () => {
  let requests = 0;
  await assert.rejects(callImageApi({ config: { baseUrl: "http://localhost:51257/v1" }, job, apiKey: "fixture",
    timeoutMs: 20, maxAttempts: 3, relayInspector: async () => null,
    fetchImpl: async () => { requests++; return new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{"data":')); } })); }
  }), error => {
    assert.equal(error.code, "IMAGE_API_EXECUTION_UNCERTAIN");
    assert.equal(error.phase, "reading_body"); return true;
  });
  assert.equal(requests, 1);
});

test("other providers keep their existing retry behavior", async () => {
  let requests = 0;
  await assert.rejects(callImageApi({ config: { baseUrl: "https://relay.example/v1" }, job, apiKey: "fixture",
    maxAttempts: 2, retryDelayMs: 0,
    fetchImpl: async () => { requests++; return response(504, "upstream_connect_timeout"); }, relayInspector: async () => null
  }), error => { assert.equal(error.code, "IMAGE_API_HTTP_ERROR"); return true; });
  assert.equal(requests, 2);
});

test("an ambiguous local disconnect stops replay; a proven connection refusal is still retryable", async () => {
  for (const code of ["UND_ERR_SOCKET", "ECONNREFUSED"]) {
    let requests = 0;
    await assert.rejects(callImageApi({ config: { baseUrl: "http://localhost:51257/v1" }, job, apiKey: "fixture",
      maxAttempts: 2, retryDelayMs: 0,
      fetchImpl: async () => { requests++; throw new TypeError("fetch failed", { cause: { code, message: "fixture disconnect" } }); }
    }), error => {
      assert.equal(error.code, code === "ECONNREFUSED" ? "IMAGE_API_NETWORK_ERROR" : "IMAGE_API_EXECUTION_UNCERTAIN");
      return true;
    });
    assert.equal(requests, code === "ECONNREFUSED" ? 2 : 1);
  }
});
