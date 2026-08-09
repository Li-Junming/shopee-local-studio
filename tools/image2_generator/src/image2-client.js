import fs from "node:fs/promises";
import path from "node:path";

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

export async function callImageApi({ config, job, apiKey, fetchImpl = fetch, maxAttempts = 3, retryDelayMs = 2500, timeoutMs = 90000 }) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await callImageApiOnce({ config, job, apiKey, fetchImpl, timeoutMs });
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts || !isRetryableImageError(error)) break;
      const delay = retryDelayMs * attempt;
      console.warn(`[image2] retry ${attempt}/${maxAttempts - 1} after transient error: ${error.message}`);
      await sleep(delay);
    }
  }
  throw lastError;
}

async function callImageApiOnce({ config, job, apiKey, fetchImpl, timeoutMs }) {
  const url = makeApiUrl(config.baseUrl, job.endpoint);
  const headers = { Authorization: `Bearer ${apiKey}` };
  let response;

  try {
    if (job.endpoint === "edits") {
      const form = new FormData();
      appendCommonFields(form, job);
      for (const imagePath of job.images) {
        const bytes = await fs.readFile(imagePath);
        const blob = new Blob([bytes], { type: mimeTypeFor(imagePath) });
        form.append(job.imageField, blob, path.basename(imagePath));
      }
      response = await fetchWithTimeout(fetchImpl, url, { method: "POST", headers, body: form }, timeoutMs);
    } else {
      response = await fetchWithTimeout(fetchImpl, url, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(commonPayload(job))
      }, timeoutMs);
    }
  } catch (error) {
    const cause = error?.cause?.message || error?.message || String(error);
    throw new Error(`Network request failed for ${url}: ${cause}. Check OPENAI_BASE_URL, proxy access, and whether the relay supports ${job.model}.`);
  }

  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  if (!response.ok) {
    throw new Error(`Image API ${response.status}: ${JSON.stringify(body).slice(0, 1200)}`);
  }
  return decodeImageResponse(body);
}

export function isRetryableImageError(error) {
  const message = String(error?.message || "");
  return /Network request failed|timed out|Image API (429|500|502|503|504)\b|upstream_error|INTERNAL_ERROR/i.test(message);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(fetchImpl, url, options, timeoutMs) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`Image API request timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  try {
    return await Promise.race([fetchImpl(url, options), timeout]);
  } finally {
    clearTimeout(timeoutId);
  }
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
