import path from "node:path";

export function normalizeConfig(raw, configPath = process.cwd()) {
  if (!raw || typeof raw !== "object") {
    throw new Error("Config must be a JSON object.");
  }
  if (!Array.isArray(raw.jobs) || raw.jobs.length === 0) {
    throw new Error("Config must include at least one job.");
  }

  const configDir = path.dirname(path.resolve(configPath));
  const outputDir = path.resolve(configDir, raw.outputDir || "outputs");
  const model = raw.model || "gpt-image-2";
  const baseUrl = normalizeBaseUrl(process.env.OPENAI_BASE_URL || raw.baseUrl || "https://api.openai.com/v1");
  const size = raw.size || raw.default?.size || "1024x1024";
  const quality = raw.quality || raw.default?.quality || "medium";
  const outputFormat = raw.outputFormat || raw.output_format || raw.default?.output_format || "png";
  const outputSize = Number(raw.outputSize || raw.output_size || 800);
  const concurrency = Number(raw.concurrency || 2);
  const maxRetryableFailures = Number(raw.maxRetryableFailures ?? raw.max_retryable_failures ?? 3);
  const imageField = raw.imageField || "image";

  if (!Number.isInteger(outputSize) || outputSize < 100) {
    throw new Error("outputSize must be an integer >= 100.");
  }
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error("concurrency must be an integer >= 1.");
  }
  if (!Number.isInteger(maxRetryableFailures) || maxRetryableFailures < 1) {
    throw new Error("maxRetryableFailures must be an integer >= 1.");
  }

  const jobs = raw.jobs.map((job, index) => normalizeJob(job, {
    index,
    configDir,
    outputDir,
    model,
    size,
    quality,
    outputFormat,
    imageField
  }));

  return { model, baseUrl, size, quality, outputFormat, outputSize, concurrency, maxRetryableFailures, outputDir, imageField, jobs };
}

function normalizeBaseUrl(value) {
  let text = String(value).trim();
  const markdownLink = text.match(/^\[[^\]]+\]\((https?:\/\/[^)]+)\)$/i);
  if (markdownLink) {
    text = markdownLink[1];
  } else {
    const bracketedUrl = text.match(/^\[(https?:\/\/[^\]]+)\]$/i);
    if (bracketedUrl) {
      text = bracketedUrl[1];
    }
  }
  if (!/^https?:\/\//i.test(text)) {
    throw new Error(`baseUrl must start with http:// or https://, got: ${text}`);
  }
  return text.replace(/\/+$/, "");
}

function normalizeJob(job, defaults) {
  if (!job || typeof job !== "object") {
    throw new Error(`Job ${defaults.index + 1} must be an object.`);
  }
  if (!job.prompt || typeof job.prompt !== "string") {
    throw new Error(`Job ${job.name || defaults.index + 1} must include prompt.`);
  }
  if (!job.out || typeof job.out !== "string") {
    throw new Error(`Job ${job.name || defaults.index + 1} must include out.`);
  }

  const images = Array.isArray(job.images) ? job.images : [];
  const endpoint = job.endpoint || (images.length > 0 ? "edits" : "generations");
  if (!["generations", "edits"].includes(endpoint)) {
    throw new Error(`Job ${job.name || defaults.index + 1} endpoint must be generations or edits.`);
  }

  return {
    name: job.name || path.basename(job.out, path.extname(job.out)),
    endpoint,
    prompt: job.prompt,
    images: images.map((imagePath) => path.resolve(defaults.configDir, imagePath)),
    outputPath: path.resolve(defaults.outputDir, job.out),
    model: job.model || defaults.model,
    size: job.size || defaults.size,
    quality: job.quality || defaults.quality,
    outputFormat: job.outputFormat || job.output_format || defaults.outputFormat,
    background: job.background,
    n: job.n || 1,
    imageField: job.imageField || defaults.imageField
  };
}
