import test from "node:test";
import assert from "node:assert/strict";
import { callImageApi, decodeImageResponse, isImageAuthError, isRetryableImageError, makeApiUrl } from "../src/image2-client.js";

test("builds OpenAI-compatible image endpoint URLs", () => {
  assert.equal(makeApiUrl("https://api.openai.com/v1", "generations"), "https://api.openai.com/v1/images/generations");
  assert.equal(makeApiUrl("https://proxy.example.com/v1/", "edits"), "https://proxy.example.com/v1/images/edits");
});

test("decodes b64_json image responses", () => {
  const body = { data: [{ b64_json: Buffer.from("pngdata").toString("base64") }] };
  const bytes = decodeImageResponse(body);
  assert.equal(bytes.toString(), "pngdata");
});

test("reports malformed image responses clearly", () => {
  assert.throws(() => decodeImageResponse({ data: [] }), /b64_json|url/);
});

test("classifies only transient image API failures as retryable", () => {
  assert.equal(isRetryableImageError(new Error("Image API 429: limited")), true);
  assert.equal(isRetryableImageError(new Error("Image API 502: upstream")), true);
  assert.equal(isRetryableImageError(new Error("Image API 400: invalid")), false);
});

test("authentication failures are fatal even when wrapped in an upstream 503", async () => {
  for (const [status, body] of [
    [401, { error: { code: "auth_failed", message: "Provided authentication token is expired. Please try signing in again." } }],
    [403, { error: { message: "Forbidden" } }],
    [503, { error: { code: "upstream_error", message: "auth_unavailable: no auth available" } }]
  ]) {
    let attempts = 0;
    await assert.rejects(callImageApi({
      config: { baseUrl: "https://api.example.com/v1" },
      job: { endpoint: "generations", prompt: "test", model: "test" },
      apiKey: "test-key",
      retryDelayMs: 1,
      fetchImpl: async () => {
        attempts++;
        return new Response(JSON.stringify(body), { status });
      }
    }), (error) => {
      assert.equal(error.code, "IMAGE_API_AUTH_FAILED");
      assert.equal(isImageAuthError(error), true);
      assert.equal(isRetryableImageError(error), false);
      assert.match(error.message, /生图接口认证失效/);
      assert.match(error.message, /重新登录/);
      return true;
    });
    assert.equal(attempts, 1);
  }
  assert.equal(isRetryableImageError(new Error("Image API 503: upstream_error busy")), true);
  assert.equal(isImageAuthError(new Error("Image API 400: bad image")), false);
});

test("retries transient upstream image API errors", async () => {
  let attempts = 0;
  const fetchImpl = async () => {
    attempts += 1;
    if (attempts === 1) {
      return new Response(JSON.stringify({ error: { code: "upstream_error" } }), { status: 502 });
    }
    return new Response(JSON.stringify({
      data: [{ b64_json: Buffer.from("pngdata").toString("base64") }]
    }), { status: 200 });
  };

  const bytes = await callImageApi({
    config: { baseUrl: "https://api.example.com/v1" },
    job: {
      endpoint: "generations",
      model: "gpt-image-2",
      prompt: "make image",
      size: "1024x1024",
      quality: "low",
      n: 1,
      outputFormat: "png"
    },
    apiKey: "test-key",
    fetchImpl,
    maxAttempts: 2,
    retryDelayMs: 1
  });

  assert.equal(bytes.toString(), "pngdata");
  assert.equal(attempts, 2);
});

test("default request does not multiply retries already performed by a relay", async () => {
  let calls = 0;
  await assert.rejects(callImageApi({
    config: { baseUrl: "http://127.0.0.1/v1" },
    job: { endpoint: "generations", prompt: "fixture", model: "fixture" },
    apiKey: "test", fetchImpl: async () => {
      calls++;
      return new Response('{"error":{"message":"busy"}}', { status: 504 });
    }
  }), /Image API 504/);
  assert.equal(calls, 1);
});

test("deadline includes a stalled response body and preserves the request id", async () => {
  const events = [];
  let signal;
  await assert.rejects(callImageApi({
    config: { baseUrl: "http://127.0.0.1/v1" },
    job: { endpoint: "generations", prompt: "private prompt", model: "fixture" },
    apiKey: "private-key", timeoutMs: 20,
    onDiagnostic: (event) => events.push(event),
    fetchImpl: async (_url, options) => {
      signal = options.signal;
      return { ok: true, status: 200, headers: new Headers({ "x-request-id": "fixture-request" }), text: () => new Promise(() => {}) };
    }
  }), (error) => {
    assert.equal(error.phase, "reading_body");
    assert.equal(error.code, "IMAGE_API_REQUEST_TIMEOUT");
    assert.equal(error.requestId, "fixture-request");
    return true;
  });
  assert.equal(signal.aborted, true);
  assert.deepEqual(events.map((e) => e.event), ["prepared", "headers", "failed"]);
  assert.doesNotMatch(JSON.stringify(events), /private prompt|private-key/);
});

test("one total deadline is not reset when response headers arrive", async () => {
  const started = performance.now();
  await assert.rejects(callImageApi({
    config: { baseUrl: "http://127.0.0.1/v1" },
    job: { endpoint: "generations", prompt: "fixture", model: "fixture" },
    apiKey: "fixture", timeoutMs: 60,
    fetchImpl: async () => {
      await new Promise((resolve) => setTimeout(resolve, 35));
      return { ok: true, status: 200, headers: new Headers(), text: () => new Promise(() => {}) };
    }
  }), /phase=reading_body/);
  assert.ok(performance.now() - started < 250);
});

test("successful slow body and allowlisted diagnostic fields are supported", async () => {
  const events = [];
  const bytes = await callImageApi({
    config: { baseUrl: "http://127.0.0.1/v1" },
    job: { endpoint: "generations", prompt: "fixture", model: "fixture" },
    apiKey: "fixture", timeoutMs: 200,
    onDiagnostic: (event) => events.push(event),
    fetchImpl: async () => ({ ok: true, status: 200, headers: new Headers(), text: async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return JSON.stringify({ data: [{ b64_json: Buffer.from("fixture").toString("base64") }] });
    } })
  });
  assert.equal(bytes.toString(), "fixture");
  assert.deepEqual(events.map((event) => event.event), ["prepared", "headers", "body_received", "complete"]);
});

test("upstream error details never echo the configured key or cookies", async () => {
  await assert.rejects(callImageApi({
    config: { baseUrl: "http://127.0.0.1/v1" },
    job: { endpoint: "generations", prompt: "fixture", model: "fixture" },
    apiKey: "private-key",
    fetchImpl: async () => new Response(JSON.stringify({ error: { message: "private-key Cookie: secret-cookie Authorization: Bearer secret-token" } }), { status: 400 })
  }), (error) => {
    assert.doesNotMatch(error.message, /private-key|secret-cookie|secret-token/);
    assert.match(error.message, /REDACTED/);
    return true;
  });
});

test("times out stalled image API requests as retryable failures", async () => {
  let requestSignal;
  await assert.rejects(
    callImageApi({
      config: { baseUrl: "https://api.example.com/v1" },
      job: {
        endpoint: "generations",
        model: "gpt-image-2",
        prompt: "make image",
        size: "1024x1024",
        quality: "low",
        n: 1,
        outputFormat: "png"
      },
      apiKey: "test-key",
      fetchImpl: (_url, options) => {
        requestSignal = options.signal;
        return new Promise(() => {});
      },
      maxAttempts: 1,
      timeoutMs: 5
    }),
    /timed out after 5ms/
  );

  assert.equal(requestSignal.aborted, true);
  assert.equal(isRetryableImageError(new Error("Image API request timed out after 5ms")), true);
});
