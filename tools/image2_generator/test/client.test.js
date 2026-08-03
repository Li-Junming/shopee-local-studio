import test from "node:test";
import assert from "node:assert/strict";
import { callImageApi, decodeImageResponse, isRetryableImageError, makeApiUrl } from "../src/image2-client.js";

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
    retryDelayMs: 1
  });

  assert.equal(bytes.toString(), "pngdata");
  assert.equal(attempts, 2);
});
