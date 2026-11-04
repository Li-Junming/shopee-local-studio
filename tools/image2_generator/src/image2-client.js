import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { inspectCockpitTimeout, isCockpitEndpoint } from "./relay-diagnostics.js";
import { traceImageRequest } from "./request-trace.js";

export function makeApiUrl(baseUrl, endpoint) {
  return `${String(baseUrl).replace(/\/+$/, "")}/images/${endpoint}`;
}

export function decodeImageResponse(body) {
  const item = body?.data?.[0];
  if (item?.b64_json) {
    return Buffer.from(item.b64_json, "base64");
  }
  throw new Error("Image response did not include data[0].b64_json. Configure the API to return base64 output.");
}

export async function callImageApi({ config, job, apiKey, fetchImpl = fetch, maxAttempts = 1, retryDelayMs = 2500, timeoutMs = 180000, onDiagnostic = () => {}, relayInspector = inspectCockpitTimeout }) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await callImageApiOnce({ config, job, apiKey, fetchImpl, timeoutMs, attempt, onDiagnostic, relayInspector });
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts || isFatalImageError(error) || !isRetryableImageError(error)) break;
      const delay = retryDelayMs * attempt;
      console.warn(`[image2] retry ${attempt}/${maxAttempts - 1} after transient error: ${error.message}`);
      await sleep(delay);
    }
  }
  throw lastError;
}

async function callImageApiOnce({ config, job, apiKey, fetchImpl, timeoutMs, attempt, onDiagnostic, relayInspector }) {
  const url = makeApiUrl(config.baseUrl, job.endpoint);
  const clientRequestId = randomUUID();
  const headers = { Authorization: `Bearer ${apiKey}`, "X-Client-Request-Id": clientRequestId };
  const protectedRelay = isCockpitEndpoint(url);
  if (protectedRelay) {
    headers["X-Cockpit-Image-Contract"] = "single-attempt-v1";
  }
  const startedAtMs = Date.now();
  const startedAt = performance.now();
  const controller = new AbortController();
  let phase = "prepare";
  let requestId;
  let timer;
  const elapsed = () => Math.round(performance.now() - startedAt);
  const emit = (event, extra = {}) => onDiagnostic({ attempt, event, phase, elapsedMs: elapsed(), clientRequestId, ...extra, ...(requestId ? { requestId } : {}) });
  const trace = traceImageRequest(url, emit);
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`Image API request timed out after ${timeoutMs}ms (phase=${phase}, elapsed=${elapsed()}ms${requestId ? `, requestId=${requestId}` : ""})`);
      error.code = "IMAGE_API_REQUEST_TIMEOUT";
      error.phase = phase;
      reject(error);
      controller.abort(error);
    }, timeoutMs);
  });
  const operation = async () => {
    let options;
    let inputBytes = 0;
    if (job.endpoint === "edits") {
      const form = new FormData();
      appendCommonFields(form, job);
      for (const imagePath of job.images) {
        const bytes = await fs.readFile(imagePath);
        inputBytes += bytes.length;
        const blob = new Blob([bytes], { type: mimeTypeFor(imagePath) });
        form.append(job.imageField, blob, path.basename(imagePath));
      }
      options = { method: "POST", headers, body: form };
    } else {
      options = {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(commonPayload(job))
      };
    }
    // Fetch cannot separate socket connection, upload and upstream header wait.
    // Report them honestly as one phase, rather than guessing where it stalled.
    emit("prepared", { inputBytes, inputImages: job.images?.length || 0 });
    phase = "waiting_headers";
    controller.signal.throwIfAborted();
    if (protectedRelay) {
      // Material preparation already consumed part of the client's deadline.
      // options may contain a copied headers object for JSON requests.
      options.headers["X-Cockpit-Image-Timeout-Ms"] = String(Math.min(300000, Math.max(1, Math.floor(timeoutMs - elapsed()))));
    }
    const response = await trace.run(() => fetchImpl(url, { ...options, signal: controller.signal }));
    if (controller.signal.aborted) {
      await response.body?.cancel().catch(() => {});
      controller.signal.throwIfAborted();
    }
    const candidate = response.headers?.get("x-request-id") || response.headers?.get("request-id");
    if (candidate && /^[A-Za-z0-9._:-]{1,128}$/.test(candidate)) requestId = candidate;
    emit("headers", { status: response.status,
      ...(protectedRelay ? { relayContract: response.headers?.get("x-cockpit-image-contract") === "single-attempt-v1" ? "single-attempt-v1" : "unacknowledged" } : {}) });
    phase = "reading_body";
    const text = await response.text();
    controller.signal.throwIfAborted();
    emit("body_received", { responseBytes: Buffer.byteLength(text) });
    phase = "decode";
    let body;
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = { raw: text };
    }
    if (!response.ok) {
      const details = body?.error || body || {};
      const error = new Error(`Image API ${response.status}: ${safeImageError(JSON.stringify({ code: details.code, type: details.type, message: details.message || details.raw || response.statusText }), apiKey).slice(0, 1200)}`);
      error.code = "IMAGE_API_HTTP_ERROR";
      error.status = response.status;
      if (details.code === "upstream_connect_timeout") error.upstreamCode = "upstream_connect_timeout";
      if (details.code === "image_upstream_execution_uncertain") error.code = "IMAGE_API_EXECUTION_UNCERTAIN";
      if (isImageAuthError(error)) {
        error.code = "IMAGE_API_AUTH_FAILED";
        error.message = `${imageAuthErrorMessage()} (${error.message})`;
      }
      throw error;
    }
    const bytes = decodeImageResponse(body);
    emit("complete", { imageBytes: bytes.length });
    return bytes;
  };
  try {
    return await Promise.race([operation(), deadline]);
  } catch (original) {
    let error = original;
    if ((error.code === "IMAGE_API_REQUEST_TIMEOUT" && phase === "waiting_headers")
      || (error.status === 504 && error.upstreamCode === "upstream_connect_timeout")) {
      let evidence;
      try { evidence = await relayInspector({ url, startedAtMs, model: job.model, endpoint: job.endpoint, timeoutMs }); } catch { /* retain original error */ }
      if (evidence) emit("relay_evidence", evidence);
      if (evidence?.confirmedHeaderTimeout) {
        const outcome = evidence.status === 499 ? "The final 499 is the client's cancellation, not the first failure."
          : `Cockpit itself returned HTTP ${evidence.status} after its internal timeouts; this is not the client's deadline.`;
        error = new Error(`IMAGE_RELAY_UPSTREAM_TIMEOUT: Cockpit accepted this request (${evidence.requestId}) but its internal attempts repeatedly timed out before upstream response headers. ${outcome} Same-route automatic replay stopped; images and pending queue preserved. Inspect Cockpit image forwarding; do not extend the outer timeout or repeatedly continue.`);
        error.code = "IMAGE_RELAY_UPSTREAM_TIMEOUT";
        error.requestId = evidence.requestId;
      }
    }
    if (!error.code && ["waiting_headers", "reading_body"].includes(phase)) {
      error = new Error(`Network request failed for ${safeEndpoint(url)}: ${safeImageError(original?.cause?.message || original?.message || String(original), apiKey)}`);
      error.code = "IMAGE_API_NETWORK_ERROR";
    }
    // Images are not idempotent: no response is not proof of no execution.
    // This also protects clients while an older Cockpit binary is still in use.
    if (protectedRelay && error.code !== "IMAGE_RELAY_UPSTREAM_TIMEOUT"
      && (error.code === "IMAGE_API_EXECUTION_UNCERTAIN"
        || (error.code === "IMAGE_API_REQUEST_TIMEOUT" && ["waiting_headers", "reading_body"].includes(phase))
        || (error.code === "IMAGE_API_NETWORK_ERROR" && !["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN"].includes(original?.cause?.code))
        || [408, 499, 500, 502, 503, 504].includes(error.status))) {
      const uncertain = new Error(`IMAGE_API_EXECUTION_UNCERTAIN: 生图请求结果不明，已停止自动重发和后续队列，保留已有图片与待执行任务。请先核对 Cockpit 请求结果再手动重试；这不代表上游一定没有执行。 原因: ${error.message}`);
      uncertain.code = "IMAGE_API_EXECUTION_UNCERTAIN";
      uncertain.status = error.status;
      error = uncertain;
    }
    error.phase ??= phase;
    error.clientRequestId = clientRequestId;
    if (requestId) error.requestId = requestId;
    error.elapsedMs = elapsed();
    emit("failed", { code: error.code || "IMAGE_API_RESPONSE_ERROR", ...(error.status ? { status: error.status } : {}) });
    throw error;
  } finally {
    clearTimeout(timer);
    trace.close();
  }
}

export function isRetryableImageError(error) {
  if (/IMAGE_QUEUE_EXHAUSTED|IMAGE_QUEUE_BLOCKED/.test(String(error?.message || ""))) return false;
  if (isImageAuthError(error)) return false;
  // Queue eligibility is retained for an explicit manual resume, while the
  // fatal classifier below stops the current run and all automatic replay.
  if (error?.code === "IMAGE_API_EXECUTION_UNCERTAIN") return true;
  const message = String(error?.message || "");
  return /Network request failed|timed out|Image API (408|429|499|500|502|503|504)\b|upstream_error|INTERNAL_ERROR/i.test(message);
}

export function isImageAuthError(error) {
  const message = String(error?.message || error || "");
  return error?.code === "IMAGE_API_AUTH_FAILED"
    || /Image API (401|403)\b|auth_failed|auth_unavailable|authentication_error|invalid_api_key|no auth available|authentication token is expired|生图接口认证失效/i.test(message);
}

export function isFatalImageError(error) {
  return isImageAuthError(error) || ["IMAGE_RELAY_UPSTREAM_TIMEOUT", "IMAGE_API_EXECUTION_UNCERTAIN"].includes(error?.code);
}

export function imageAuthErrorMessage() {
  return "生图接口认证失效或无可用授权，已停止后续生图。请在生图代理中重新登录或刷新上游授权，并检查 API 密钥后再继续；不是 BigSeller 登录问题。";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeEndpoint(url) {
  const parsed = new URL(url);
  return `${parsed.origin}${parsed.pathname}`;
}

export function safeImageError(value, apiKey = "") {
  let message = String(value);
  if (apiKey) message = message.split(apiKey).join("[REDACTED]");
  return message.replace(/(?:agt_codex_|sk-)[A-Za-z0-9_.-]+/g, "[REDACTED]")
    .replace(/Bearer\s+[^\s"',}]+/ig, "Bearer [REDACTED]")
    .replace(/((?:api[_-]?key|access_token|refresh_token|cookie|authorization)["']?\s*[:=]\s*)["']?[^\s"',}]+/ig, "$1[REDACTED]");
}

function commonPayload(job) {
  const payload = {
    model: job.model,
    prompt: job.prompt,
    size: job.size,
    quality: job.quality,
    n: job.n,
    output_format: job.outputFormat
  };
  if (job.background) payload.background = job.background;
  return payload;
}

function appendCommonFields(form, job) {
  for (const [key, value] of Object.entries(commonPayload(job))) {
    if (value !== undefined && value !== null) {
      form.append(key, String(value));
    }
  }
}

function mimeTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  return "image/png";
}
