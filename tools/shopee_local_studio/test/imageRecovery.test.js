import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_IMAGE_NO_PROGRESS_LIMIT, imageProcessFailure, imageRecoveryDelay } from "../src/imageRecovery.js";

test("request timeouts remain retryable and retain their phase in the pipeline error", () => {
  const error = imageProcessFailure("[error] Error: Image API request timed out after 180000ms (phase=reading_body)\n    at fixture", 1);
  assert.equal(error.retryable, true);
  assert.match(error.message, /phase=reading_body/);
});

test("a terminal queue budget overrides earlier transient errors in the same process", () => {
  const error = imageProcessFailure("[image2] failed fixture: Image API request timed out\n[error] Error: IMAGE_QUEUE_EXHAUSTED: no eligible jobs", 1);
  assert.equal(error.retryable, false);
  assert.match(error.message, /IMAGE_QUEUE_EXHAUSTED/);
});

test("validation, permanent HTTP errors and process crashes do not loop automatically", () => {
  for (const text of ["[error] Error: Image API 400: bad image", "Missing OPENAI_API_KEY", "SyntaxError: fixture"]) {
    assert.equal(imageProcessFailure(text, 1).retryable, false);
  }
});

test("single-route failures back off and no-progress retries are bounded", () => {
  assert.equal(DEFAULT_IMAGE_NO_PROGRESS_LIMIT, 2);
  assert.equal(imageRecoveryDelay(1, 30000, 0), 30000);
  assert.equal(imageRecoveryDelay(1, 30000, 2), 60000);
  assert.equal(imageRecoveryDelay(1, 30000, 8), 120000);
  assert.equal(imageRecoveryDelay(2, 30000, 2), 0);
});

test("upstream TLS disconnects are distinct from local request timeouts", () => {
  const error = imageProcessFailure('[error] Error: Image API 502: {"code":"upstream_unavailable","message":"Unable to connect to the image upstream: tls handshake eof"}', 1);
  assert.equal(error.code, "IMAGE_UPSTREAM_TLS_ERROR");
  assert.equal(error.retryable, true);
  assert.match(error.message, /tls handshake eof/);
});

test("confirmed Cockpit internal timeouts stop website replay without masking the cause as client cancellation", () => {
  const error = imageProcessFailure('[image2] failed first: timed out\n[error] Error: IMAGE_RELAY_UPSTREAM_TIMEOUT: Cockpit request fixture; two internal 504s before final 499', 1);
  assert.equal(error.code, "IMAGE_RELAY_UPSTREAM_TIMEOUT");
  assert.equal(error.retryable, false);
  assert.match(error.message, /two internal 504s/);
});

test("a possibly accepted image is not automatically restarted by the website", () => {
  const error = imageProcessFailure('[error] Error: IMAGE_API_EXECUTION_UNCERTAIN: verify upstream before retrying', 1);
  assert.equal(error.code, "IMAGE_API_EXECUTION_UNCERTAIN");
  assert.equal(error.retryable, false);
  assert.match(error.message, /verify upstream/);
});
