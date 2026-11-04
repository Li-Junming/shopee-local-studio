import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { imageAuthErrorMessage, isImageAuthError } from "../../image2_generator/src/image2-client.js";
import { DEFAULT_IMAGE_NO_PROGRESS_LIMIT, imageProcessFailure, imageRecoveryDelay } from "./imageRecovery.js";
import { childProcessEnv } from "./processRuntime.js";
import { inspectTaskWorkers, interruptedBatchQueue, recoverTaskFiles, writeJsonAtomic, readJsonAtomic } from "./taskRecovery.js";
import { buildBigSellerCliArgs, verifyBigSellerCompletion } from "./bigSellerProcess.js";
import {
  STORE_DEFINITIONS,
  buildBigSellerCopyConfig,
  buildBigSellerSourceConfig,
  buildBigSellerSkuConfig,
  buildImage2CliArgs,
  buildImageArchiveManifest,
  buildImage2Config,
  buildImageResultSummary,
  buildPreflightReport,
  buildTaskProgress,
  describeImage2Runtime,
  effectiveBigSellerItemIds,
  effectiveBigSellerSkuGroup,
  effectiveImageApiEnv,
  expandProductCodeSkuGroup,
  extractSourceDraftSkuGroup,
  imageResultMatchesQuery,
  listProductCodeMappings,
  makeListingDraft,
  normalizeImageApiConfig,
  normalizeImageReview,
  normalizeSourceImages,
  parseTaskText,
  parseSkuGroup,
  pipelineStartBlockers,
  pipelineStageCompleted,
  publicImageApiConfig,
  recordPipelineTiming,
  recordCommandResult,
  startStandaloneImageTiming,
  removeProductCodeMapping,
  requireBuyerProductIdentity,
  resolveTargetStoreIds,
  shouldAutoConfirmSource,
  shouldShowTask,
  assertSourceReviewReady,
  sourceImagesMissingMessage,
  sourceReviewState,
  sourceSkuMatchRisk,
  storesFor,
  upsertProductCodeMapping,
  validateVietnameseListing
} from "./core.js";
import { resolveStoreFrameAssets } from "./storeFrames.js";
import { createZipBuffer } from "./zip.js";
import { COPY_RULE_VERSION, makeAuditedListings, auditListingSet } from "./listing-quality.js";
import {
  batchQueueCounts,
  createBatchQueueRecord,
  currentBatchItem,
  parseBatchInputs
} from "./batchQueue.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");
const workspaceRoot = path.resolve(appRoot, "..", "..");
const publicRoot = path.join(appRoot, "public");
const appDataRoot = process.env.STUDIO_DATA_ROOT || path.join(appRoot, "data");
const dataRoot = path.join(appDataRoot, "tasks");
const uploadRoot = path.join(appDataRoot, "uploads");
const productCodeMapPath = process.env.PRODUCT_CODE_MAP_PATH || path.join(appDataRoot, "product-code-map.json");
const runtimeConfigPath = process.env.RUNTIME_CONFIG_PATH || path.join(appDataRoot, "runtime-config.json");
const batchQueuePath = process.env.BATCH_QUEUE_PATH || path.join(appDataRoot, "batch-queue.json");
const image2Cli = path.join(workspaceRoot, "tools", "image2_generator", "src", "cli.js");
const bigSellerCli = path.join(workspaceRoot, "tools", "bigseller_draft_filler", "src", "fill-drafts.js");
const bigSellerRoot = path.resolve(path.dirname(bigSellerCli), "..");
const LISTING_RULE_VERSION = COPY_RULE_VERSION;
const IMAGE_API_RETRY_COOLDOWN_MS = Number(process.env.IMAGE_API_RETRY_COOLDOWN_MS || 30000);
const IMAGE_API_NO_PROGRESS_LIMIT = Number(process.env.IMAGE_API_NO_PROGRESS_LIMIT || DEFAULT_IMAGE_NO_PROGRESS_LIMIT);
const activePipelines = new Set();
const activeCommands = new Map();
const taskMutations = new Set();
let batchQueueRunnerActive = false;

await fs.mkdir(dataRoot, { recursive: true });
await fs.mkdir(uploadRoot, { recursive: true });
await recoverTaskFiles(dataRoot);
await recoverBatchQueue();

const server = http.createServer(async (req, res) => {
  try {
    await route(req, res);
  } catch (error) {
    sendJson(res, error.statusCode === 409 ? 409 : 500, { error: error.message });
  }
});

const port = Number(process.env.PORT || 3777);
const host = process.env.HOST || "127.0.0.1";
server.listen(port, host, () => {
  console.log(`Shopee Local Studio running at http://${host}:${port}`);
});

async function route(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "127.0.0.1"}`);
  const parts = url.pathname.split("/").filter(Boolean);

  if (url.pathname === "/api/health") return sendJson(res, 200, { ok: true, pid: process.pid, uptimeSeconds: Math.floor(process.uptime()), activeTasks: activePipelines.size, activeCommands: activeCommands.size, activeMutations: taskMutations.size });
  if (url.pathname === "/api/stores") return sendJson(res, 200, { stores: STORE_DEFINITIONS });
  if (url.pathname === "/api/batch-queue" && req.method === "GET") return sendJson(res, 200, { queue: batchQueueResponse(await loadBatchQueue()) });
  if (url.pathname === "/api/batch-queue" && req.method === "POST") return sendJson(res, 201, { queue: batchQueueResponse(await createBatchQueue(await readJson(req))) });
  if (url.pathname === "/api/batch-queue/start" && req.method === "POST") return sendJson(res, 202, { queue: batchQueueResponse(await startBatchQueue()) });
  if (url.pathname === "/api/batch-queue/pause" && req.method === "POST") return sendJson(res, 200, { queue: batchQueueResponse(await pauseBatchQueue()) });
  if (url.pathname === "/api/batch-queue/resume" && req.method === "POST") return sendJson(res, 202, { queue: batchQueueResponse(await startBatchQueue()) });
  if (url.pathname === "/api/batch-queue/skip-current" && req.method === "POST") return sendJson(res, 200, { queue: batchQueueResponse(await skipCurrentBatchItem()) });
  if (url.pathname === "/api/store-frames") return sendJson(res, 200, await storeFrameStatus());
  if (url.pathname === "/api/runtime-config" && req.method === "GET") return sendJson(res, 200, await runtimeConfigResponse());
  if (url.pathname === "/api/runtime-config" && req.method === "PUT") return sendJson(res, 200, await saveRuntimeConfigRoute(await readJson(req)));
  if (url.pathname === "/api/runtime-config" && req.method === "DELETE") return sendJson(res, 200, await deleteRuntimeConfigRoute());
  if (url.pathname === "/api/product-code-map" && req.method === "GET") return sendJson(res, 200, await productCodeMapResponse());
  if (parts[0] === "api" && parts[1] === "product-code-map" && parts[2] && req.method === "PUT") return sendJson(res, 200, await upsertProductCodeMapRoute(decodeURIComponent(parts[2]), await readJson(req)));
  if (parts[0] === "api" && parts[1] === "product-code-map" && parts[2] && req.method === "DELETE") return sendJson(res, 200, await deleteProductCodeMapRoute(decodeURIComponent(parts[2])));
  if (url.pathname === "/api/parse-task-text" && req.method === "POST") return sendJson(res, 200, { task: await resolveParsedTaskIdentifiers(parseTaskText((await readJson(req)).text)) });
  if (url.pathname === "/api/uploads" && req.method === "POST") return sendJson(res, 201, { files: await saveUploadedImages(await readJson(req)) });
  if (url.pathname === "/api/image-results" && req.method === "GET") return sendJson(res, 200, { results: await listImageResults({
    query: url.searchParams.get("q") || "",
    includeArchived: parseBoolean(url.searchParams.get("includeArchived"))
  }) });
  if (url.pathname === "/api/tasks" && req.method === "GET") return sendJson(res, 200, { tasks: await listTasks({
    query: url.searchParams.get("q") || "",
    includeArchived: parseBoolean(url.searchParams.get("includeArchived"))
  }) });
  if (url.pathname === "/api/tasks" && req.method === "POST") return sendJson(res, 201, { task: await createTask(await readJson(req)) });
  if (parts[0] === "api" && parts[1] === "tasks" && parts[2]) {
    const task = await readTask(parts[2]);
    const mutating = !["GET", "HEAD"].includes(req.method);
    if (mutating && (activePipelines.has(task.id) || activeCommands.has(task.id) || taskMutations.has(task.id))) {
      return sendJson(res, 409, { error: "此任务仍有后台操作正在执行，不能重复提交或修改。" });
    }
    if (mutating) taskMutations.add(task.id);
    try {
    if (mutating && task.status === "interrupted") await assertInterruptedTaskIdle(task);
    if (parts.length === 3 && req.method === "GET") return sendJson(res, 200, { task });
    if (parts.length === 3 && req.method === "DELETE") return sendJson(res, 200, { ok: true, deletedTaskId: await deleteTask(task) });
    if (parts[3] === "archive" && req.method === "POST") return sendJson(res, 200, { task: await setTaskArchived(task, true) });
    if (parts[3] === "unarchive" && req.method === "POST") return sendJson(res, 200, { task: await setTaskArchived(task, false) });
    if (parts[3] === "download" && req.method === "GET") return serveTaskDownload(res, task);
    if (parts[3] === "image-review" && req.method === "PUT") return sendJson(res, 200, { task: await updateImageReview(task, await readJson(req)) });
    if (parts[3] === "source-check" && req.method === "POST") return sendJson(res, 200, { task: await checkSourceProduct(task) });
    if (parts[3] === "confirm-source" && req.method === "POST") return sendJson(res, 200, { task: await confirmSourceProduct(task) });
    if (parts[3] === "confirm-source-and-run" && req.method === "POST") return runFullPipelineRoute(res, await confirmSourceProduct(task));
    if (parts[3] === "reject-source" && req.method === "POST") return sendJson(res, 200, { task: await rejectSourceProduct(task) });
    if (parts[3] === "source-images" && req.method === "GET") return sendJson(res, 200, { images: await listSourceImages(task), review: sourceReviewState(task) });
    if (parts[3] === "source-image" && req.method === "GET") return serveSourceImage(res, task, url.searchParams.get("file"));
    if (parts[3] === "preflight" && req.method === "GET") {
      const preflight = await taskPreflight(task);
      return sendJson(res, 200, { preflight, progress: buildTaskProgress(task, { preflight }) });
    }
    if (parts[3] === "listings" && req.method === "PUT") return sendJson(res, 200, { task: await updateListings(task, await readJson(req)) });
    if (parts[3] === "regenerate-listings" && req.method === "POST") return sendJson(res, 200, { task: await regenerateListings(task) });
    if (parts[3] === "image2-config" && req.method === "POST") return sendJson(res, 200, { task: await writeImage2Config(task) });
    if (parts[3] === "generate" && req.method === "POST") return sendJson(res, 202, { task: await runImage2(task) });
    if (parts[3] === "regenerate-images" && req.method === "POST") return sendJson(res, 202, { task: await runImage2(task, { overwrite: true }) });
    if (parts[3] === "bigseller-config" && req.method === "POST") return sendJson(res, 200, { task: await writeBigSellerConfig(task) });
    if (parts[3] === "copy-source-drafts" && req.method === "POST") return sendJson(res, 202, { task: await runBigSellerCopySourceDrafts(task) });
    if (parts[3] === "discover" && req.method === "POST") return sendJson(res, 202, { task: await runBigSellerDiscover(task) });
    if (parts[3] === "save" && req.method === "POST") return sendJson(res, 202, { task: await runBigSellerSave(task) });
    if (parts[3] === "run-all" && req.method === "POST") return runFullPipelineRoute(res, task);
    if (parts[3] === "logs" && req.method === "GET") return sendText(res, 200, await readLogs(task));
    if (parts[3] === "images" && req.method === "GET") {
      const images = await listImages(task);
      return sendJson(res, 200, { images, progress: await imageSlotProgress(task, images) });
    }
    if (parts[3] === "image" && req.method === "GET") return serveTaskImage(res, task, url.searchParams.get("file"));
    } finally {
      if (mutating) taskMutations.delete(task.id);
    }
  }

  return serveStatic(req, res, url.pathname);
}

async function createTask(body) {
  const skuResolution = await resolveSkuInput(body.skuGroup);
  const skuGroup = skuResolution.skuGroup;
  const targetStores = resolveTargetStoreIds(body.targetStores);
  const sourceImages = normalizeSourceImages(body.sourceImages);
  const productName = body.productName?.trim() || skuGroup.join(" ");
  if (skuGroup.length === 0) throw new Error("At least one SKU is required.");
  if (targetStores.length === 0) throw new Error("At least one store is required.");

  const id = `${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${skuGroup[0].toLowerCase()}`;
  const taskDir = path.join(dataRoot, id);
  const listings = Object.fromEntries(targetStores.map((storeId) => [storeId, makeListingDraft({
    productName,
    notes: body.notes,
    storeId,
    skuGroup,
    allowFallbackIdentity: true
  })]));
  const task = {
    id,
    productName,
    skuGroup,
    productCodes: skuResolution.productCodes,
    productCodeMappings: skuResolution.mappings,
    targetStores,
    sourceImages,
    notes: body.notes || "",
    listingSource: body.productName?.trim() ? "user" : (sourceImages.length > 0 ? "fallback" : "sku"),
    listingRuleVersion: LISTING_RULE_VERSION,
    status: "created",
    listings,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    paths: {
      taskDir,
      imagesDir: path.join(taskDir, "images"),
      sourceImagesDir: path.join(taskDir, "source-images"),
      image2Config: path.join(taskDir, "image2.jobs.json"),
      bigsellerSourceConfig: path.join(taskDir, "bigseller.source-jobs.json"),
      sourceImageManifest: path.join(taskDir, "source-images", "source-images.json"),
      bigsellerCopyConfig: path.join(taskDir, "bigseller.copy-jobs.json"),
      bigsellerSkuConfig: path.join(taskDir, "bigseller.sku-jobs.json"),
      bigsellerJobsConfig: path.join(taskDir, "bigseller.discovered.json")
    }
  };
  await fs.mkdir(task.paths.imagesDir, { recursive: true });
  await fs.mkdir(task.paths.sourceImagesDir, { recursive: true });
  await saveTask(task);
  await appendLog(task, `Created task for ${task.productName}`);
  if (skuResolution.expanded) {
    await appendLog(task, `[product code map] ${skuResolution.mappings.map((item) => `${item.productCode} -> ${item.skus.join(", ")}`).join("; ")}`);
  }
  return task;
}

async function resolveParsedTaskIdentifiers(task) {
  const skuResolution = await resolveSkuInput(task.skuGroup);
  return {
    ...task,
    skuGroup: skuResolution.skuGroup,
    productCodes: skuResolution.productCodes,
    productCodeMappings: skuResolution.mappings
  };
}

async function resolveSkuInput(input) {
  return expandProductCodeSkuGroup(input, await loadProductCodeMap());
}

async function loadProductCodeMap() {
  const text = await fs.readFile(productCodeMapPath, "utf8").catch((error) => {
    if (error.code === "ENOENT") return "";
    throw error;
  });
  return text ? JSON.parse(text) : {};
}

async function saveProductCodeMap(productCodeMap) {
  await fs.mkdir(path.dirname(productCodeMapPath), { recursive: true });
  await fs.writeFile(productCodeMapPath, `${JSON.stringify(productCodeMap, null, 2)}\n`, "utf8");
}

async function loadRuntimeConfig() {
  const text = await fs.readFile(runtimeConfigPath, "utf8").catch((error) => {
    if (error.code === "ENOENT") return "";
    throw error;
  });
  if (!text) return {};
  return normalizeImageApiConfig(JSON.parse(text));
}

async function saveRuntimeConfig(config) {
  await fs.mkdir(path.dirname(runtimeConfigPath), { recursive: true });
  await fs.writeFile(runtimeConfigPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

async function runtimeConfigResponse() {
  const config = await loadRuntimeConfig();
  const runtime = await image2RuntimeStatus(config);
  const publicConfig = publicImageApiConfig({
    baseUrl: config.baseUrl || runtime.baseUrl,
    apiKey: config.apiKey || "",
    model: config.model,
    fallbackBaseUrl: config.fallbackBaseUrl,
    fallbackApiKey: config.fallbackApiKey,
    fallbackModel: config.fallbackModel
  });
  if (!publicConfig.apiKeySet && runtime.apiKeySet) {
    publicConfig.apiKeySet = true;
    publicConfig.maskedApiKey = "";
    publicConfig.apiKeySource = "environment";
  } else {
    publicConfig.apiKeySource = publicConfig.apiKeySet ? "local" : "none";
  }
  const fallbackRuntime = config.fallbackBaseUrl
    ? await image2RuntimeStatus({
      baseUrl: config.fallbackBaseUrl,
      apiKey: config.fallbackApiKey || "",
      model: config.fallbackModel || config.model
    })
    : null;
  return {
    path: runtimeConfigPath,
    config: publicConfig,
    runtime: { ...runtime, failoverEnabled: Boolean(fallbackRuntime?.apiKeySet) },
    fallbackRuntime
  };
}

async function saveRuntimeConfigRoute(body) {
  const current = await loadRuntimeConfig();
  const requestedBaseUrl = String(body?.baseUrl || current.baseUrl || "https://api.openai.com/v1").trim();
  const baseChanged = current.baseUrl && normalizeImageApiConfig({ baseUrl: requestedBaseUrl }).baseUrl !== current.baseUrl;
  const apiKey = String(body?.apiKey || "").trim() || (baseChanged ? "" : current.apiKey || "");
  if (baseChanged && !apiKey) throw new Error("切换主中转站时必须填写该中转站的 API Key。");
  const fallbackBaseUrl = String(body?.fallbackBaseUrl ?? current.fallbackBaseUrl ?? "").trim();
  const fallbackChanged = fallbackBaseUrl && current.fallbackBaseUrl
    ? normalizeImageApiConfig({ baseUrl: fallbackBaseUrl }).baseUrl !== current.fallbackBaseUrl
    : fallbackBaseUrl !== String(current.fallbackBaseUrl || "");
  const fallbackApiKey = fallbackBaseUrl
    ? String(body?.fallbackApiKey || "").trim() || (fallbackChanged ? "" : current.fallbackApiKey || "")
    : "";
  if (fallbackBaseUrl && !fallbackApiKey) throw new Error("启用备用中转站时必须填写备用 API Key。");
  const config = normalizeImageApiConfig({
    baseUrl: requestedBaseUrl,
    apiKey,
    model: body?.model || current.model || "gpt-image-2.5",
    fallbackBaseUrl,
    fallbackApiKey,
    fallbackModel: body?.fallbackModel || current.fallbackModel || body?.model || current.model || "gpt-image-2.5"
  });
  await saveRuntimeConfig(config);
  return runtimeConfigResponse();
}

async function deleteRuntimeConfigRoute() {
  await fs.rm(runtimeConfigPath, { force: true }).catch((error) => {
    if (error.code !== "ENOENT") throw error;
  });
  return runtimeConfigResponse();
}

async function productCodeMapResponse() {
  const map = await loadProductCodeMap();
  return {
    path: productCodeMapPath,
    mappings: listProductCodeMappings(map)
  };
}

async function upsertProductCodeMapRoute(productCode, body) {
  const current = await loadProductCodeMap();
  const result = upsertProductCodeMapping(current, productCode, body.skus ?? body.skuGroup);
  await saveProductCodeMap(result.map);
  return {
    mapping: result.mapping,
    mappings: listProductCodeMappings(result.map)
  };
}

async function deleteProductCodeMapRoute(productCode) {
  const current = await loadProductCodeMap();
  const result = removeProductCodeMapping(current, productCode);
  await saveProductCodeMap(result.map);
  return {
    deletedProductCode: result.productCode,
    mappings: listProductCodeMappings(result.map)
  };
}

async function saveUploadedImages(body) {
  const files = Array.isArray(body.files) ? body.files : [];
  if (files.length === 0) throw new Error("No image files provided.");
  const batchDir = path.join(uploadRoot, new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14));
  await fs.mkdir(batchDir, { recursive: true });
  const saved = [];

  for (let index = 0; index < files.length; index++) {
    const file = files[index] || {};
    const match = String(file.dataUrl || "").match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/i);
    if (!match) throw new Error(`Unsupported image data for file ${index + 1}.`);
    const bytes = Buffer.from(match[2], "base64");
    if (bytes.length > 15 * 1024 * 1024) throw new Error(`Image ${index + 1} is larger than 15MB.`);
    const ext = extensionForMime(match[1]);
    const stem = safeName(file.name || `image-${index + 1}`);
    const filePath = path.join(batchDir, `${String(index + 1).padStart(2, "0")}-${stem}${ext}`);
    await fs.writeFile(filePath, bytes);
    saved.push({ name: file.name || path.basename(filePath), path: filePath });
  }

  return saved;
}

async function writeBigSellerSourceConfig(task, options = {}) {
  ensureSourceTaskPaths(task);
  const config = buildBigSellerSourceConfig({
    productName: task.productName,
    skuGroup: task.skuGroup,
    sourceImageDir: task.paths.sourceImagesDir,
    targetStores: task.targetStores
  });
  await fs.writeFile(task.paths.bigsellerSourceConfig, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  if (!options.preserveStatus) task.status = "source_config_ready";
  task.updatedAt = new Date().toISOString();
  await saveTask(task);
  await appendLog(task, `Wrote BigSeller source config: ${task.paths.bigsellerSourceConfig}`);
  return task;
}

async function ensureSourceImages(task) {
  ensureSourceTaskPaths(task);
  if (Array.isArray(task.sourceImages) && task.sourceImages.length > 0) {
    return task;
  }

  const existingManifest = await readSourceManifest(task);
  if (existingManifest) {
    await appendLog(task, `[source] Reusing ${existingManifest.sourceImages.length} existing source image(s); BigSeller lookup is not repeated.`);
    return applySourceManifest(task, existingManifest);
  }

  await updateStatus(task, "fetching_source_images");
  await writeBigSellerSourceConfig(task, { preserveStatus: true });
  try {
    await runCommandAsync(task, "bigseller_source", process.execPath, buildBigSellerCliArgs({
      cliPath: bigSellerCli, configPath: task.paths.bigsellerSourceConfig,
      mode: "source", outDir: task.paths.sourceImagesDir
    }), bigSellerRoot);
  } catch (error) {
    // Preserve the real lookup failure; fallback listing generation can otherwise
    // replace it with the unrelated "English brand and product name" error.
    const failed = await readTask(task.id);
    failed.sourceFallbackReason = error.message;
    await updateStatus(failed, "source_lookup_failed");
    await appendLog(task, `[source] ${error.message}`);
    throw error;
  }

  const manifest = await readSourceManifest(task);
  if (!manifest) {
    throw new Error(sourceImagesMissingMessage(task));
  }

  return applySourceManifest(task, manifest);
}

async function readSourceManifest(task) {
  const manifestText = await fs.readFile(task.paths.sourceImageManifest, "utf8").catch((error) => {
    if (error.code === "ENOENT") return "";
    throw error;
  });
  if (!manifestText) return null;

  const manifest = JSON.parse(manifestText);
  const requestedSkus = new Set((task.skuGroup || []).map((sku) => String(sku).trim()).filter(Boolean));
  const manifestSkus = (Array.isArray(manifest.skus) ? manifest.skus : [])
    .map((sku) => String(sku).trim())
    .filter(Boolean);
  if (manifestSkus.length && !manifestSkus.some((sku) => requestedSkus.has(sku))) return null;

  const sourceRoot = path.resolve(task.paths.sourceImagesDir);
  const sourceImages = [];
  for (const sourceImage of Array.isArray(manifest.sourceImages) ? manifest.sourceImages : []) {
    const resolved = path.resolve(sourceImage);
    if (!resolved.startsWith(`${sourceRoot}${path.sep}`)) continue;
    const stat = await fs.stat(resolved).catch((error) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (stat?.isFile() && stat.size > 0) sourceImages.push(resolved);
  }
  if (!sourceImages.length) return null;
  return { ...manifest, sourceImages };
}

async function applySourceManifest(task, manifest) {
  task.sourceImages = manifest.sourceImages;
  task.sourceEditUrl = manifest.editUrl;
  task.sourceTitle = manifest.sourceTitle || "";
  task.sourceDetail = manifest.sourceDetail || "";
  task.sourceRowText = manifest.sourceRowText || "";
  task.sourceMatchedSkuGroup = Array.isArray(manifest.skus) ? manifest.skus : task.skuGroup;
  task.sourceDraftSkuGroup = extractSourceDraftSkuGroup(manifest);
  task.sourceReviewRequired = true;
  task.sourceConfirmedAt = "";
  task.sourceRejectedAt = "";
  task.sourceMatchRisk = sourceSkuMatchRisk(task);
  if (task.sourceTitle && shouldUseSourceListing(task)) {
    task.productName = manifest.sourceTitle;
    task.listingSource = "source";
    try {
      task.listings = makeListingsForTask(task);
    } catch (error) {
      task.copyGenerationError = `文案生成或审核失败（来源商品已找到）：${error.message}`;
      await saveTask(task);
      throw new Error(task.copyGenerationError);
    }
    task.copyGenerationError = "";
    await appendLog(task, `Updated listing text from source title: ${task.sourceTitle}`);
  }
  task.status = "source_review_required";
  task.updatedAt = new Date().toISOString();
  await saveTask(task);
  await appendLog(task, `Loaded ${task.sourceImages.length} source images from 1-store. Review is required before image generation.`);
  if (task.sourceDraftSkuGroup.length) {
    await appendLog(task, `[source sku] BigSeller draft search will use SKU: ${task.sourceDraftSkuGroup.join(", ")}.`);
  }
  await appendLog(task, `[source match] ${task.sourceMatchRisk.level}: ${task.sourceMatchRisk.message} Matched SKU: ${task.sourceMatchRisk.matchedSkus.join(", ") || "none"}.`);
  return task;
}

async function loadBatchQueue() {
  const text = await fs.readFile(batchQueuePath, "utf8").catch((error) => {
    if (error.code === "ENOENT") return "";
    throw error;
  });
  return text ? JSON.parse(text) : {
    version: 1,
    status: "empty",
    targetStores: [],
    notes: "",
    currentIndex: 0,
    lastMessage: "尚未创建批量队列。",
    createdAt: "",
    updatedAt: "",
    items: []
  };
}

async function saveBatchQueue(queue) {
  queue.updatedAt = new Date().toISOString();
  await fs.mkdir(path.dirname(batchQueuePath), { recursive: true });
  await fs.writeFile(batchQueuePath, `${JSON.stringify(queue, null, 2)}\n`, "utf8");
  return queue;
}

function batchQueueResponse(queue) {
  return { ...queue, counts: batchQueueCounts(queue), runnerActive: batchQueueRunnerActive };
}

async function createBatchQueue(body) {
  const existing = await loadBatchQueue();
  if (batchQueueRunnerActive || ["running", "pausing"].includes(existing.status)) {
    throw new Error("当前批量队列仍在运行，请先暂停并等待当前商品结束。");
  }
  const inputs = parseBatchInputs(body.text ?? body.inputs);
  const targetStores = resolveTargetStoreIds(body.targetStores);
  if (!targetStores.length) throw new Error("请先勾选至少一个目标店铺。");
  if (body.start !== false && activePipelines.size > 0) {
    throw new Error("当前还有单商品流程正在运行，请等待完成后再开始批量队列。");
  }
  const queue = createBatchQueueRecord({ inputs, targetStores, notes: body.notes });
  await saveBatchQueue(queue);
  if (body.start !== false) return startBatchQueue();
  return queue;
}

async function startBatchQueue() {
  const queue = await loadBatchQueue();
  if (!queue.items?.length) throw new Error("请先创建批量队列。");
  if (queue.status === "done") throw new Error("这批商品已经全部处理完成，请粘贴新清单创建下一批。");
  if (!batchQueueRunnerActive && activePipelines.size > 0) {
    throw new Error("当前还有单商品流程正在运行，请等待完成后再开始批量队列。");
  }
  queue.status = "running";
  queue.lastMessage = "批量队列运行中。";
  const current = currentBatchItem(queue);
  if (current && ["failed", "needs_confirmation"].includes(current.status)) {
    current.status = "waiting";
    current.error = "";
  }
  await saveBatchQueue(queue);
  scheduleBatchQueue();
  return queue;
}

async function pauseBatchQueue() {
  const queue = await loadBatchQueue();
  if (queue.status !== "running") return queue;
  queue.status = "paused";
  queue.lastMessage = batchQueueRunnerActive
    ? "已请求暂停；当前商品会处理完，之后不再开始下一个。"
    : "批量队列已暂停。";
  return saveBatchQueue(queue);
}

async function skipCurrentBatchItem() {
  const queue = await loadBatchQueue();
  if (batchQueueRunnerActive) throw new Error("当前商品仍在运行，不能跳过。请先暂停并等待它结束。");
  const item = currentBatchItem(queue);
  if (!item) return queue;
  item.status = "skipped";
  item.error = "";
  item.finishedAt = new Date().toISOString();
  queue.currentIndex = item.index + 1;
  queue.status = currentBatchItem(queue) ? "paused" : "done";
  queue.lastMessage = queue.status === "done" ? "批量队列已完成。" : `已跳过 ${item.input}，点击继续处理下一项。`;
  return saveBatchQueue(queue);
}

function scheduleBatchQueue() {
  if (batchQueueRunnerActive) return;
  setTimeout(() => runBatchQueue().catch((error) => console.error(`[batch queue] ${error.message}`)), 0);
}

async function recoverBatchQueue() {
  const queue = await loadBatchQueue();
  const paused = interruptedBatchQueue(queue);
  if (paused) await saveBatchQueue(paused);
}

async function assertInterruptedTaskIdle(task) {
  const inventory = await inspectTaskWorkers(dataRoot);
  if (!inventory.known || inventory.workers.some(worker => worker.taskId === task.id)) {
    throw Object.assign(new Error("旧执行进程尚在运行或无法确认已退出。为避免重复生图或保存草稿，暂不允许继续；请先核对后台进程。"), { statusCode: 409 });
  }
}

async function runBatchQueue() {
  if (batchQueueRunnerActive) return;
  batchQueueRunnerActive = true;
  try {
    while (true) {
      let queue = await loadBatchQueue();
      if (queue.status !== "running") return;
      const item = currentBatchItem(queue);
      if (!item) {
        queue.status = "done";
        queue.lastMessage = "批量队列已完成。";
        await saveBatchQueue(queue);
        return;
      }
      if (activePipelines.size > 0 && (!item.taskId || !activePipelines.has(item.taskId))) {
        queue.status = "paused";
        queue.lastMessage = "检测到另一个商品流程正在运行，批量队列已暂停。";
        await saveBatchQueue(queue);
        return;
      }

      item.status = "running";
      item.error = "";
      item.startedAt ||= new Date().toISOString();
      queue.currentIndex = item.index;
      queue.lastMessage = `正在处理第 ${item.index + 1}/${queue.items.length} 项：${item.input}`;
      await saveBatchQueue(queue);

      const result = await runBatchQueueItem(item, queue);
      queue = await loadBatchQueue();
      const savedItem = queue.items?.[item.index];
      if (!savedItem) throw new Error("批量队列内容在运行期间发生变化。");
      savedItem.taskId = result.taskId || savedItem.taskId;
      savedItem.status = result.status;
      savedItem.error = result.error || "";
      if (["done", "failed", "needs_confirmation"].includes(result.status)) {
        savedItem.finishedAt = new Date().toISOString();
      }

      if (result.status !== "done") {
        queue.status = "paused";
        queue.lastMessage = result.error || `第 ${item.index + 1} 项需要处理后再继续。`;
        await saveBatchQueue(queue);
        return;
      }

      queue.currentIndex = item.index + 1;
      if (queue.status !== "running") {
        queue.status = "paused";
        queue.lastMessage = `第 ${item.index + 1} 项已完成，批量队列已暂停。`;
        await saveBatchQueue(queue);
        return;
      }
      if (!currentBatchItem(queue)) {
        queue.status = "done";
        queue.lastMessage = `全部 ${queue.items.length} 个商品已处理完成。`;
        await saveBatchQueue(queue);
        return;
      }
      queue.lastMessage = `第 ${item.index + 1} 项已完成，准备处理下一项。`;
      await saveBatchQueue(queue);
    }
  } finally {
    batchQueueRunnerActive = false;
  }
}

async function runBatchQueueItem(item, queue) {
  let task;
  try {
    task = item.taskId
      ? await readTask(item.taskId)
      : await createTask({ skuGroup: item.input, targetStores: queue.targetStores, notes: queue.notes });
    item.taskId = task.id;
    const latestQueue = await loadBatchQueue();
    if (latestQueue.items?.[item.index]) {
      latestQueue.items[item.index].taskId = task.id;
      await saveBatchQueue(latestQueue);
    }
    if (task.status === "pipeline_done") return { status: "done", taskId: task.id };

    const preflight = await taskPreflight(task);
    const blockers = pipelineStartBlockers(preflight, task);
    if (blockers.length) {
      task.status = "preflight_blocked";
      task.updatedAt = new Date().toISOString();
      await saveTask(task);
      const error = blockers.map((blocker) => blocker.message).join(" ");
      await appendLog(task, `[batch queue preflight] ${error}`);
      if (task.sourceReviewRequired && !sourceReviewState(task).ready) {
        return {
          status: "needs_confirmation",
          taskId: task.id,
          error: `${item.input} 需要人工确认 1 店来源商品；确认后点击“继续队列”。`
        };
      }
      return { status: "failed", taskId: task.id, error };
    }

    await runFullPipeline(task, { wait: true });
    const finishedTask = await readTask(task.id);
    if (finishedTask.status === "pipeline_done") return { status: "done", taskId: task.id };
    if (!sourceReviewState(finishedTask).ready) {
      return {
        status: "needs_confirmation",
        taskId: task.id,
        error: `${item.input} 需要人工确认 1 店来源商品；确认后点击“继续队列”。`
      };
    }
    return {
      status: "failed",
      taskId: task.id,
      error: `${item.input} 在 ${finishedTask.status || "未知步骤"} 停止，请打开该任务查看日志后继续。`
    };
  } catch (error) {
    return { status: "failed", taskId: task?.id || item.taskId || "", error: error.message };
  }
}

async function useFallbackSource(task, reason) {
  clearSourceEvidence(task);
  task.sourceFallback = true;
  task.sourceFallbackReason = reason;
  task.sourceReviewRequired = true;
  task.status = "source_lookup_failed";
  task.listingSource = "fallback";
  task.listings = makeListingsForTask(task, { allowFallbackIdentity: true });
  task.updatedAt = new Date().toISOString();
  await saveTask(task);
  await appendLog(task, `[source fallback] ${reason}`);
  await appendLog(task, "[source fallback] 1-store source evidence is missing. Upload source images or fix source lookup before continuing.");
  return task;
}

async function checkSourceProduct(task) {
  clearSourceEvidence(task);
  task.sourceFallback = false;
  task.sourceFallbackReason = "";
  await saveTask(task);
  await appendLog(task, "[source review] Starting 1-store source lookup.");
  return ensureSourceImages(task);
}

function clearSourceEvidence(task) {
  task.sourceImages = [];
  task.sourceEditUrl = "";
  task.sourceTitle = "";
  task.sourceDetail = "";
  task.sourceRowText = "";
  task.sourceMatchedSkuGroup = [];
  task.sourceDraftSkuGroup = [];
  task.sourceMatchRisk = null;
  task.sourceConfirmedAt = "";
  task.sourceRejectedAt = "";
  task.sourceReviewRequired = false;
}

async function confirmSourceProduct(task) {
  if (!Array.isArray(task.sourceImages) || task.sourceImages.length === 0) {
    throw new Error("Cannot confirm source product without source images.");
  }
  task.sourceReviewRequired = true;
  task.sourceConfirmedAt = new Date().toISOString();
  task.sourceRejectedAt = "";
  task.status = "source_confirmed";
  task.updatedAt = new Date().toISOString();
  await saveTask(task);
  await appendLog(task, `[source review] Confirmed 1-store source product: ${task.sourceTitle || task.productName}`);
  return task;
}

async function autoConfirmSourceProduct(task) {
  if (!shouldAutoConfirmSource(task)) return task;
  task.sourceReviewRequired = true;
  task.sourceConfirmedAt = new Date().toISOString();
  task.sourceRejectedAt = "";
  task.status = "source_auto_confirmed";
  task.updatedAt = new Date().toISOString();
  await saveTask(task);
  await appendLog(task, `[source review] Auto-confirmed 1-store source product by strong Item ID/SKU match: ${task.sourceTitle || task.productName}`);
  return task;
}

async function rejectSourceProduct(task) {
  task.sourceReviewRequired = true;
  task.sourceConfirmedAt = "";
  task.sourceRejectedAt = new Date().toISOString();
  task.status = "source_rejected";
  task.updatedAt = new Date().toISOString();
  await saveTask(task);
  await appendLog(task, "[source review] Rejected 1-store source product. Rerun lookup or paste/upload source images before generation.");
  return task;
}

function ensureSourceTaskPaths(task) {
  task.paths ??= {};
  task.paths.taskDir ??= path.join(dataRoot, task.id);
  task.paths.sourceImagesDir ??= path.join(task.paths.taskDir, "source-images");
  task.paths.bigsellerSourceConfig ??= path.join(task.paths.taskDir, "bigseller.source-jobs.json");
  task.paths.bigsellerCopyConfig ??= path.join(task.paths.taskDir, "bigseller.copy-jobs.json");
  task.paths.sourceImageManifest ??= path.join(task.paths.sourceImagesDir, "source-images.json");
}

async function writeImage2Config(task, options = {}) {
  task = await ensureSourceImages(task);
  assertSourceReviewReady(task);
  const frameStatus = await storeFrameStatus(task.targetStores);
  task.storeFrameRoot = frameStatus.root;
  task.storeFrames = frameStatus.frames;
  task.storeFrameMissing = frameStatus.missing;
  const config = buildImage2Config({
    taskDir: task.paths.taskDir,
    productName: task.productName,
    skuGroup: task.skuGroup,
    targetStores: task.targetStores,
    sourceImages: task.sourceImages,
    storeFrames: task.storeFrames,
    imageReview: task.imageReview,
    notes: task.notes,
    model: options.model,
    allowFallbackIdentity: Boolean(task.sourceFallback)
  });
  if (options.queueSessionId) config.queueSessionId = options.queueSessionId;
  config.maxJobAttempts = 2;
  await fs.writeFile(task.paths.image2Config, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  task.status = "image2_config_ready";
  task.updatedAt = new Date().toISOString();
  await saveTask(task);
  await appendLog(task, `Wrote image2 config: ${task.paths.image2Config}`);
  await appendLog(task, `[store frames] matched ${Object.keys(task.storeFrames || {}).join(", ") || "none"} from ${task.storeFrameRoot}`);
  if (task.storeFrameMissing?.length) {
    await appendLog(task, `[store frames] missing ${task.storeFrameMissing.join(", ")}; generation will continue without those frame references.`);
  }
  return task;
}

async function writeBigSellerConfig(task) {
  await writeListingFiles(task);
  const bigSellerSkuGroup = effectiveBigSellerSkuGroup(task);
  const config = buildBigSellerSkuConfig({
    productName: task.productName,
    skuGroup: bigSellerSkuGroup,
    assetRoot: task.paths.imagesDir,
    targetStores: task.targetStores
  });
  await fs.writeFile(task.paths.bigsellerSkuConfig, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  task.status = "bigseller_config_ready";
  task.updatedAt = new Date().toISOString();
  await saveTask(task);
  await appendLog(task, `Wrote BigSeller SKU config: ${task.paths.bigsellerSkuConfig}`);
  await appendLog(task, `[bigseller sku] Draft lookup SKU: ${bigSellerSkuGroup.join(", ") || "(empty)"}.`);
  return task;
}

async function writeBigSellerCopyConfig(task) {
  ensureSourceTaskPaths(task);
  const bigSellerSkuGroup = effectiveBigSellerSkuGroup(task);
  const bigSellerItemIds = effectiveBigSellerItemIds(task);
  const config = buildBigSellerCopyConfig({
    productName: task.productName,
    skuGroup: bigSellerSkuGroup,
    itemIds: bigSellerItemIds,
    targetStores: task.targetStores
  });
  await fs.writeFile(task.paths.bigsellerCopyConfig, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  task.status = "bigseller_copy_config_ready";
  task.updatedAt = new Date().toISOString();
  await saveTask(task);
  await appendLog(task, `Wrote BigSeller copy config: ${task.paths.bigsellerCopyConfig}`);
  await appendLog(task, `[bigseller sku] Copy/draft check SKU: ${bigSellerSkuGroup.join(", ") || "(empty)"}.`);
  if (bigSellerItemIds.length) {
    await appendLog(task, `[bigseller item] Source fallback Item ID: ${bigSellerItemIds.join(", ")}.`);
  }
  return task;
}

async function updateListings(task, body) {
  const nextListings = body.listings || {};
  const proposed = { ...task.listings, ...Object.fromEntries(Object.entries(nextListings).filter(([id]) => task.targetStores.includes(id))) };
  const audit = auditListingSet(proposed, { productName: task.productName, notes: listingNotes(task), storeIds: task.targetStores });
  if (!audit.valid) throw new Error(audit.errors.join(" "));
  for (const [storeId, listing] of Object.entries(nextListings)) {
    if (!task.targetStores.includes(storeId)) continue;
    const result = validateVietnameseListing(listing);
    if (!result.valid) {
      throw new Error(`${storeId}: ${result.errors.join(" ")}`);
    }
    task.listings[storeId] = {
      title: String(listing.title || "").trim(),
      detail: String(listing.detail || "").trim()
    };
  }
  task.listingRuleVersion = LISTING_RULE_VERSION;
  task.listingAudit = audit;
  task.copyGenerationError = '';
  task.lastPipelineError = '';
  task.status = "listings_updated";
  task.updatedAt = new Date().toISOString();
  await saveTask(task);
  await appendLog(task, "Updated listing text.");
  return task;
}

async function updateImageReview(task, body) {
  task.imageReview = normalizeImageReview({
    ...body,
    updatedAt: new Date().toISOString()
  });
  task.updatedAt = new Date().toISOString();
  await saveTask(task);
  await appendLog(task, `[image review] ${task.imageReview.status}; flags: ${task.imageReview.flags.join(", ") || "none"}; notes: ${task.imageReview.notes || "none"}`);
  return task;
}

async function regenerateListings(task) {
  task.listings = makeListingsForTask(task, { allowFallbackIdentity: shouldAllowFallbackIdentity(task) });
  task.listingRuleVersion = LISTING_RULE_VERSION;
  task.copyGenerationError = '';
  task.lastPipelineError = '';
  task.status = "listings_regenerated";
  task.updatedAt = new Date().toISOString();
  await saveTask(task);
  await appendLog(task, "Regenerated listing text.");
  return task;
}

async function writeListingFiles(task) {
  const allowFallbackIdentity = shouldAllowFallbackIdentity(task);
  if (shouldRegenerateListingsBeforeExport(task)) {
    task.listings = makeListingsForTask(task, { allowFallbackIdentity });
    task.listingRuleVersion = LISTING_RULE_VERSION;
    task.updatedAt = new Date().toISOString();
    await saveTask(task);
  }
  const audit = auditListingSet(task.listings, { productName: task.productName, notes: listingNotes(task), storeIds: task.targetStores });
  if (!audit.valid) throw new Error(`文案审核未通过：${audit.errors.join(" ")}`);
  for (const store of storesFor(task.targetStores)) {
    const listing = task.listings?.[store.id] || makeListingDraft({
      productName: task.productName,
      notes: listingNotes(task),
      storeId: store.id,
      skuGroup: task.skuGroup,
      requireIdentity: true,
      allowFallbackIdentity
    });
    const result = validateVietnameseListing(listing);
    if (!result.valid) {
      throw new Error(`${store.label}: ${result.errors.join(" ")}`);
    }
    const folder = path.join(task.paths.imagesDir, store.folder);
    await fs.mkdir(folder, { recursive: true });
    await fs.writeFile(path.join(folder, "title.txt"), listing.title, "utf8");
    await fs.writeFile(path.join(folder, "detail.txt"), listing.detail, "utf8");
  }
}

function shouldRegenerateListingsBeforeExport(task) {
  if (task.status === "listings_updated") return false;
  return task.listingRuleVersion !== LISTING_RULE_VERSION || shouldUseSourceListing(task);
}

function makeListingsForTask(task, options = {}) {
  const listings = makeAuditedListings({ productName: task.productName, notes: listingNotes(task), storeIds: task.targetStores });
  task.listingAudit = auditListingSet(listings, { productName: task.productName, notes: listingNotes(task), storeIds: task.targetStores });
  return listings;
}

function listingNotes(task) {
  return [task.notes, task.sourceTitle, task.sourceDetail].filter(Boolean).join("\n");
}

function shouldUseSourceListing(task) {
  if (["source", "user", "fallback"].includes(task.listingSource)) return false;
  const skuText = Array.isArray(task.skuGroup) ? task.skuGroup.join(" ") : "";
  return !task.productName || task.productName === skuText || task.listingSource === "sku";
}

function shouldAllowFallbackIdentity(task) {
  return Boolean(
    task.sourceFallback ||
    task.listingSource === "sku" ||
    task.listingSource === "fallback" ||
    productNameIsSkuOnly(task)
  );
}

function productNameIsSkuOnly(task) {
  const skuText = Array.isArray(task.skuGroup) ? task.skuGroup.join(" ") : "";
  return !String(task.productName || "").trim() || String(task.productName || "").trim() === skuText;
}

async function runImage2(task, options = {}) {
  task = await ensureSourceImages(task);
  assertSourceReviewReady(task);
  await assertImage2RuntimeReady(task);
  const [imageRoute] = await image2ProcessRoutes();
  const imageEnv = imageRoute.env;
  if (options.overwrite) {
    task = await archiveCurrentImages(task, "regenerate-images");
  }
  await writeImage2Config(task, { model: imageRoute.model, queueSessionId: randomUUID() });
  if (task.pipelineTiming) {
    task.pipelineTimingHistory = [...(task.pipelineTimingHistory || []), task.pipelineTiming];
  }
  task.pipelineTiming = startStandaloneImageTiming();
  task.status = options.overwrite ? "regenerating_images" : "generating_images";
  task.updatedAt = task.pipelineTiming.startedAt;
  await saveTask(task);
  runCommand(task, "image2", process.execPath, buildImage2CliArgs({
    cliPath: image2Cli,
    configPath: task.paths.image2Config,
    overwrite: Boolean(options.overwrite)
  }), appRoot, { env: imageEnv });
  return task;
}

async function runBigSellerDiscover(task) {
  await writeBigSellerConfig(task);
  task.status = "discovering_bigseller_drafts";
  await saveTask(task);
  runCommand(task, "bigseller_discover", process.execPath, buildBigSellerCliArgs({
    cliPath: bigSellerCli, configPath: task.paths.bigsellerSkuConfig,
    mode: "discover", outPath: task.paths.bigsellerJobsConfig
  }), bigSellerRoot);
  return task;
}

async function runBigSellerCopySourceDrafts(task) {
  await writeBigSellerCopyConfig(task);
  task.status = "copying_source_to_bigseller_drafts";
  await saveTask(task);
  runCommand(task, "bigseller_copy", process.execPath, buildBigSellerCliArgs({
    cliPath: bigSellerCli, configPath: task.paths.bigsellerCopyConfig, mode: "copy"
  }), bigSellerRoot);
  return task;
}

async function runBigSellerSave(task) {
  await writeListingFiles(task);
  await enforceDraftVerification(task);
  await appendLog(task, "Refreshed listing files before BigSeller save.");
  task.status = "saving_bigseller_drafts";
  await saveTask(task);
  runCommand(task, "bigseller_save", process.execPath, buildBigSellerCliArgs({
    cliPath: bigSellerCli, configPath: task.paths.bigsellerJobsConfig, mode: "save"
  }), bigSellerRoot);
  return task;
}

async function enforceDraftVerification(task) {
  const config = JSON.parse(await fs.readFile(task.paths.bigsellerJobsConfig, 'utf8'));
  Object.assign(config, { verifySavedText: true, verifySavedImages: true, requiredImageCount: 4, requiredSaveVerificationVersion: 1 });
  await writeJsonAtomic(task.paths.bigsellerJobsConfig, config);
}

async function runFullPipeline(task, options = {}) {
  if (activePipelines.has(task.id)) {
    await appendLog(task, "[pipeline] Full pipeline is already running; ignored duplicate start.");
    return task;
  }
  if (activeCommands.has(task.id)) throw new Error("此任务已有后台命令正在执行。");
  if (task.status === "interrupted") await assertInterruptedTaskIdle(task);
  activePipelines.add(task.id);
  task.status = "pipeline_queued";
  task.lastPipelineError = '';
  task.updatedAt = new Date().toISOString();
  await saveTask(task);
  await appendLog(task, "Queued full pipeline: source -> copy 1-store drafts -> images -> BigSeller discover -> save draft.");
  const pipelinePromise = runPipelineInBackground(task.id);
  if (options.wait) await pipelinePromise;
  return task;
}

async function runFullPipelineRoute(res, task) {
  const preflight = await taskPreflight(task);
  const blockers = pipelineStartBlockers(preflight, task);
  if (blockers.length) {
    await appendLog(task, `[preflight] ${preflight.status}: ${blockers.map((item) => item.message).join(" ")}`);
    task.status = "preflight_blocked";
    task.updatedAt = new Date().toISOString();
    await saveTask(task);
    return sendJson(res, 409, { task, preflight, error: blockers.map((item) => item.message).join(" ") });
  }
  return sendJson(res, 202, { task: await runFullPipeline(task), preflight });
}

async function runPipelineInBackground(taskId) {
  let task = await readTask(taskId).catch(() => null);
  if (!task) {
    activePipelines.delete(taskId);
    return;
  }
  const resumeTask = structuredClone(task);
  try {
    await updateStatus(task, "pipeline_queued");
    task = await ensureSourceImages(task);
    if (!sourceReviewState(task).ready) {
      task = await autoConfirmSourceProduct(task);
      if (!sourceReviewState(task).ready) {
        await appendLog(task, "[source review] Full pipeline paused. Confirm the 1-store source product, then run the full pipeline again.");
        return;
      }
    }

    task = await readTask(taskId);
    let hasDiscoveredConfig = await fileExists(task.paths.bigsellerJobsConfig);
    if (pipelineStageCompleted(resumeTask, "bigseller_copy", { hasDiscoveredConfig })) {
      await appendLog(task, "[pipeline resume] Skip BigSeller copy; target drafts were already copied.");
    } else {
      await updateStatus(task, "pipeline_copying_source_to_bigseller_drafts");
      await writeBigSellerCopyConfig(task);
      await updateStatus(task, "pipeline_copying_source_to_bigseller_drafts");
      await runCommandAsync(task, "bigseller_copy", process.execPath, buildBigSellerCliArgs({
        cliPath: bigSellerCli, configPath: task.paths.bigsellerCopyConfig, mode: "copy"
      }), bigSellerRoot);
    }

    task = await readTask(taskId);
    const imageCount = (await listImages(task)).length;
    if (pipelineStageCompleted(resumeTask, "image_generation", { imageCount })) {
      await appendLog(task, `[pipeline resume] Skip image generation; ${imageCount} generated image(s) already exist.`);
    } else {
      await updateStatus(task, "pipeline_generating_images");
      await assertImage2RuntimeReady(task);
      const imageRoutes = await image2ProcessRoutes();
      const imageRoute = imageRoutes[0];
      if (imageCount > 0) {
        await appendLog(task, `[pipeline resume] Preserve ${imageCount} generated image(s); generate missing images only.`);
      }
      const queueSessionId = randomUUID();
      await writeImage2Config(task, { model: imageRoute.model, queueSessionId });
      await updateStatus(task, "pipeline_generating_images");
      await runImageGenerationWithRecovery(task, imageCount, imageRoutes, queueSessionId);
    }

    task = await readTask(taskId);
    if (pipelineStageCompleted(resumeTask, "bigseller_discover", { hasDiscoveredConfig: await fileExists(task.paths.bigsellerJobsConfig) })) {
      await appendLog(task, "[pipeline resume] Skip BigSeller discover; draft links were already discovered.");
    } else {
      await updateStatus(task, "pipeline_discovering_bigseller_drafts");
      await writeBigSellerConfig(task);
      await updateStatus(task, "pipeline_discovering_bigseller_drafts");
      await runCommandAsync(task, "bigseller_discover", process.execPath, buildBigSellerCliArgs({
        cliPath: bigSellerCli, configPath: task.paths.bigsellerSkuConfig,
        mode: "discover", outPath: task.paths.bigsellerJobsConfig
      }), bigSellerRoot);
    }

    task = await readTask(taskId);
    if (pipelineStageCompleted(resumeTask, "bigseller_save")) {
      await appendLog(task, "[pipeline resume] Skip BigSeller save; drafts were already saved.");
    } else {
      await updateStatus(task, "pipeline_saving_bigseller_drafts");
      await enforceDraftVerification(task);
      await runCommandAsync(task, "bigseller_save", process.execPath, buildBigSellerCliArgs({
        cliPath: bigSellerCli, configPath: task.paths.bigsellerJobsConfig, mode: "save"
      }), bigSellerRoot);
    }

    task = await readTask(taskId);
    await updateStatus(task, "pipeline_done");
    await appendLog(task, "Full pipeline finished.");
  } catch (error) {
    task = await readTask(taskId).catch(() => task);
    if (task) {
      task.lastPipelineError = String(error.message || error).slice(0, 2500);
      await updateStatus(task, "pipeline_failed");
      await appendLog(task, `[pipeline] ${error.message}`);
    }
  } finally {
    activePipelines.delete(taskId);
  }
}

async function runImageGenerationWithRecovery(task, initialImageCount, initialRoutes, queueSessionId) {
  let imageCount = Number(initialImageCount || 0);
  let routes = initialRoutes;
  let routeIndex = 0;
  let imageRoute = routes[routeIndex];
  let imageEnv = imageRoute.env;
  let noProgressRounds = 0;

  await appendLog(task, `[image route] Using ${imageRouteLabel(imageRoute)}.`);

  while (true) {
    try {
      await runCommandAsync(task, "image2", process.execPath, buildImage2CliArgs({
        cliPath: image2Cli,
        configPath: task.paths.image2Config
      }), appRoot, { env: imageEnv });
      return;
    } catch (error) {
      const authError = isImageAuthError(error);
      if (!authError && !error.retryable) throw error;

      task = await readTask(task.id);
      const nextImageCount = (await listImages(task)).length;
      const madeProgress = nextImageCount > imageCount;
      noProgressRounds = madeProgress ? 0 : noProgressRounds + 1;
      imageCount = nextImageCount;

      routes = await image2ProcessRoutes();
      if (authError && routes.length < 2) throw error;
      routeIndex = routes.length > 1 ? (routeIndex + 1) % routes.length : 0;
      imageRoute = routes[routeIndex];
      imageEnv = imageRoute.env;

      if (noProgressRounds >= IMAGE_API_NO_PROGRESS_LIMIT) {
        throw new Error(`image2 made no progress in ${noProgressRounds} automatic retry rounds; ${imageCount} generated image(s) were preserved. Check the Cockpit image route before retrying. Last failure (${error.code || "IMAGE_API_ERROR"}): ${error.message}`);
      }

      await updateStatus(task, "pipeline_waiting_image_api");
      const retryDelayMs = imageRecoveryDelay(routes.length, IMAGE_API_RETRY_COOLDOWN_MS, noProgressRounds);
      await appendLog(task, `[pipeline] Image API temporarily unstable; preserved ${imageCount} generated image(s). Automatic retry via ${imageRouteLabel(imageRoute)} in ${Math.ceil(retryDelayMs / 1000)} seconds${madeProgress ? " after making progress" : ""}. Persisted queue resumes untouched images first.`);
      await sleep(retryDelayMs);

      task = await readTask(task.id);
      await assertImage2RuntimeReady(task);
      await updateStatus(task, "pipeline_generating_images");
      await writeImage2Config(task, { model: imageRoute.model, queueSessionId });
      await updateStatus(task, "pipeline_generating_images");
      await appendLog(task, `[pipeline retry] Resume missing images only; ${imageCount} generated image(s) already exist.`);
    }
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fileExists(filePath) {
  if (!filePath) return false;
  return fs.access(filePath).then(() => true, () => false);
}

async function archiveCurrentImages(task, reason) {
  const images = await listImages(task);
  if (!images.length) return task;
  const manifest = buildImageArchiveManifest(task, images, imageArchiveId());
  for (const entry of manifest.entries) {
    await fs.mkdir(path.dirname(entry.to), { recursive: true });
    await fs.rename(entry.from, entry.to).catch(async (error) => {
      if (error.code === "ENOENT") return;
      throw error;
    });
  }
  task.imageArchiveRuns ??= [];
  task.imageArchiveRuns.push({
    archiveId: manifest.archiveId,
    archiveDir: manifest.archiveDir,
    count: manifest.count,
    reason,
    createdAt: new Date().toISOString()
  });
  task.updatedAt = new Date().toISOString();
  await saveTask(task);
  await appendLog(task, `[image archive] moved ${manifest.count} current image(s) to ${manifest.archiveDir} before ${reason}.`);
  return task;
}

function imageArchiveId() {
  return new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
}

async function assertImage2RuntimeReady(task) {
  const config = await loadRuntimeConfig();
  const runtime = describeImage2Runtime(process.env, config);
  if (!runtime.apiKeySet) {
    await markImage2PreflightFailed(task, "Missing image API key. Configure it in Shopee Local Studio before generating images.");
  }
  if (runtime.invalidBaseUrl) {
    await markImage2PreflightFailed(task, `Invalid OPENAI_BASE_URL: ${runtime.baseUrl}`);
  }
  if (runtime.localProxy) {
    const ok = await canConnect(runtime.localProxy.host, runtime.localProxy.port, 1500);
    if (!ok) {
      await markImage2PreflightFailed(task, `Cannot connect to image2 proxy at ${runtime.baseUrl}. Start the local proxy first, then retry image generation.`);
    }
  }
}

async function markImage2PreflightFailed(task, message) {
  task.status = "image2_preflight_failed";
  task.updatedAt = new Date().toISOString();
  await saveTask(task);
  await appendLog(task, `[image2 preflight] ${message}`);
  throw new Error(message);
}

function canConnect(host, port, timeoutMs) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const done = (value) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(timeoutMs);
    socket.on("connect", () => done(true));
    socket.on("timeout", () => done(false));
    socket.on("error", () => done(false));
  });
}

async function image2ProcessEnv() {
  return effectiveImageApiEnv(process.env, await loadRuntimeConfig());
}

async function image2ProcessRoutes() {
  const config = await loadRuntimeConfig();
  const primaryEnv = effectiveImageApiEnv(process.env, config);
  const routes = [{
    name: "主中转站",
    model: config.model || "gpt-image-2.5",
    env: primaryEnv
  }];
  if (config.fallbackBaseUrl && config.fallbackApiKey) {
    routes.push({
      name: "备用中转站",
      model: config.fallbackModel || config.model || "gpt-image-2.5",
      env: effectiveImageApiEnv(process.env, {
        baseUrl: config.fallbackBaseUrl,
        apiKey: config.fallbackApiKey
      })
    });
  }
  return routes;
}

function imageRouteLabel(route) {
  let host = route?.env?.OPENAI_BASE_URL || "unknown";
  try {
    host = new URL(host).host;
  } catch {}
  return `${route?.name || "中转站"} (${host}, ${route?.model || "gpt-image-2.5"})`;
}

function runCommand(task, label, command, args, cwd, options = {}) {
  const finish = async (error) => {
    const fresh = await readTask(task.id).catch(() => task);
    fresh.status = error ? `${label}_failed` : `${label}_done`;
    fresh.lastPipelineError = error ? String(error.message || error).slice(0, 2500) : '';
    fresh.updatedAt = new Date().toISOString();
    if (label === "image2") {
      fresh.pipelineTiming = recordPipelineTiming(fresh.pipelineTiming, fresh.status, fresh.updatedAt);
    }
    await saveTask(fresh);
    if (error) await appendLog(fresh, `[${label}] ${error.message}`);
  };
  // Manual buttons and the full pipeline must use identical success checks.
  return runCommandAsync(task, label, command, args, cwd, options)
    .then(() => finish(), (error) => finish(error))
    .catch((error) => appendLog(task, `[${label}] result persistence failed: ${error.message}`));
}

function runCommandAsync(task, label, command, args, cwd, options = {}) {
  if (activeCommands.has(task.id)) return Promise.reject(new Error("此任务已有后台命令正在执行。"));
  activeCommands.set(task.id, { label });
  appendLog(task, `[${label}] ${command} ${args.join(" ")}`);
  return new Promise((resolve, reject) => {
    let child;
    try { child = spawn(command, args, {
      cwd,
      env: childProcessEnv(options.env || process.env),
      windowsHide: true
    }); } catch (error) {
      activeCommands.delete(task.id);
      reject(error);
      return;
    }
    activeCommands.set(task.id, { label, pid: child.pid });
    let stderrTail = "";
    let stdoutTail = "";
    let launchError;
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdoutTail = (stdoutTail + chunk).slice(-32000);
      appendLog(task, chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderrTail = (stderrTail + chunk).slice(-16000);
      appendLog(task, chunk);
    });
    child.on("error", (error) => { launchError = error; });
    child.on("close", async (code) => {
      try {
      let verification = {};
      let failure = launchError;
      if (!failure && code === 0) {
        try {
          verification = await verifyBigSellerCompletion(task, label, stdoutTail, { readSourceManifest });
        } catch (error) {
          failure = error;
        }
      }
      if (failure) verification = { verified: false, error: failure.message };
      try {
        const fresh = await readTask(task.id);
        fresh.commandResults = recordCommandResult(fresh, label, code, new Date().toISOString(), verification);
        await saveTask(fresh);
        await appendLog(task, `[${label}] exit ${code}${failure ? `; rejected: ${failure.message}` : ""}`);
      } catch (error) {
        reject(error);
        return;
      }
      if (failure) reject(failure);
      else if (code === 0) resolve();
      else if (label === "image2" && isImageAuthError(stderrTail)) reject(new Error(imageAuthErrorMessage()));
      else if (label === "image2") reject(imageProcessFailure(stderrTail, code));
      else {
        const detail = stderrTail.match(/ERROR:\s*([\s\S]*)/i)?.[1]?.trim() || stderrTail.trim().split('\n').slice(-4).join('\n');
        reject(new Error(`${label} failed with exit ${code}${detail ? `: ${detail.slice(0, 1800)}` : ''}`));
      }
      } finally {
        activeCommands.delete(task.id);
      }
    });
  });
}

async function updateStatus(task, status) {
  const now = new Date().toISOString();
  task.status = status;
  task.pipelineTiming = recordPipelineTiming(task.pipelineTiming, status, now) || task.pipelineTiming;
  task.updatedAt = now;
  await saveTask(task);
}

async function storeFrameStatus(storeIds = STORE_DEFINITIONS.map((store) => store.id)) {
  return resolveStoreFrameAssets({ storeIds: storesFor(storeIds).map((store) => store.id) });
}

async function taskPreflight(task) {
  const frameStatus = await storeFrameStatus(task.targetStores);
  const runtime = await image2RuntimeStatus();
  const images = await listImages(task);
  return buildPreflightReport(task, {
    runtime,
    storeFrameMissing: frameStatus.missing,
    generatedImageCount: images.length
  });
}

async function image2RuntimeStatus(config = null) {
  const runtime = describeImage2Runtime(process.env, config ?? await loadRuntimeConfig());
  if (runtime.localProxy) {
    runtime.localProxyReachable = await canConnect(runtime.localProxy.host, runtime.localProxy.port, 1500);
  }
  return runtime;
}

async function listTasks(options = {}) {
  const entries = await fs.readdir(dataRoot, { withFileTypes: true }).catch(() => []);
  const tasks = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const task = await readTask(entry.name).catch(() => null);
    if (!task || task.productName === "Demo Product Check") continue;
    if (!shouldShowTask(task, options)) continue;
    tasks.push(task);
  }
  return tasks.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function listImageResults(options = {}) {
  const tasks = await listTasks({ includeArchived: true });
  const results = [];
  for (const task of tasks) {
    if (!options.includeArchived && task?.archived) continue;
    const images = await listImages(task);
    if (!images.length) continue;
    const result = buildImageResultSummary(task, images);
    if (!imageResultMatchesQuery(result, options.query)) continue;
    results.push(result);
  }
  return results.sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)));
}

async function readTask(id) {
  const task = await readJsonAtomic(path.join(dataRoot, id, "task.json"));
  return ensureListingRulesCurrent(task);
}

async function ensureListingRulesCurrent(task) {
  if (task.listingRuleVersion === LISTING_RULE_VERSION) return task;
  // Reading historical tasks must not silently overwrite manually edited copy.
  // New rules are enforced on regeneration, editing and export/save instead.
  task.listingAudit = auditListingSet(task.listings, { productName: task.productName, notes: listingNotes(task), storeIds: task.targetStores || [] });
  return task;
}

async function saveTask(task) {
  await fs.mkdir(task.paths.taskDir, { recursive: true });
  await writeJsonAtomic(path.join(task.paths.taskDir, "task.json"), task);
}

async function setTaskArchived(task, archived) {
  task.archived = Boolean(archived);
  task.archivedAt = archived ? new Date().toISOString() : "";
  task.updatedAt = new Date().toISOString();
  await saveTask(task);
  await appendLog(task, archived ? "[task] Archived." : "[task] Unarchived.");
  return task;
}

async function deleteTask(task) {
  const taskDir = path.resolve(task.paths?.taskDir || path.join(dataRoot, task.id));
  assertPathInside(taskDir, dataRoot, { allowRoot: false });
  await fs.rm(taskDir, { recursive: true, force: true });
  return task.id;
}

async function appendLog(task, text) {
  await fs.mkdir(task.paths.taskDir, { recursive: true });
  await fs.appendFile(path.join(task.paths.taskDir, "logs.txt"), `${text.trimEnd()}\n`, "utf8");
}

async function readLogs(task) {
  return fs.readFile(path.join(task.paths.taskDir, "logs.txt"), "utf8").catch(() => "");
}

async function listImages(task) {
  const out = [];
  for (const store of storesFor(task.targetStores)) {
    const folder = path.join(task.paths.imagesDir, store.folder);
    const entries = await fs.readdir(folder).catch(() => []);
    for (const file of entries.filter((name) => name.toLowerCase().endsWith(".png")).sort()) {
      out.push({
        store: store.id,
        storeLabel: store.label,
        file: `${store.folder}/${file}`,
        url: `/api/tasks/${task.id}/image?file=${encodeURIComponent(`${store.folder}/${file}`)}`
      });
    }
  }
  return out;
}

async function imageSlotProgress(task, images) {
  let checkpoint;
  try { checkpoint = JSON.parse(await fs.readFile(`${task.paths.image2Config}.queue-state.json`, 'utf8')); } catch {}
  const running = activeCommands.get(task.id)?.label === 'image2';
  const names = ['01_product.png', '02_effect.png', '03_real.png', '04_real.png'];
  return storesFor(task.targetStores).map(store => ({
    store: store.id, label: store.label,
    slots: names.map(file => {
      const exists = images.some(image => image.file === `${store.folder}/${file}`);
      const record = checkpoint?.jobs?.[path.join(task.paths.imagesDir, store.folder, file)];
      const state = exists ? 'done' : record?.status === 'active' ? (running ? 'active' : 'interrupted') : record?.status === 'blocked' ? 'blocked' : record?.lastFailure ? 'retry' : 'pending';
      return { file, state, attempts: record?.attempts || 0, lastFailure: record?.lastFailure?.code || '' };
    })
  }));
}

async function listSourceImages(task) {
  ensureSourceTaskPaths(task);
  const out = [];
  const sourceRoot = path.resolve(task.paths.sourceImagesDir);
  for (const sourcePath of Array.isArray(task.sourceImages) ? task.sourceImages : []) {
    const resolved = path.resolve(sourcePath);
    if (!resolved.startsWith(`${sourceRoot}${path.sep}`)) continue;
    const file = path.relative(sourceRoot, resolved).split(path.sep).join("/");
    out.push({
      file,
      url: `/api/tasks/${task.id}/source-image?file=${encodeURIComponent(file)}`
    });
  }
  return out;
}

async function serveTaskImage(res, task, file) {
  if (!file || file.includes("..")) return sendText(res, 400, "Bad image path");
  const imagePath = path.resolve(task.paths.imagesDir, file);
  if (!imagePath.startsWith(path.resolve(task.paths.imagesDir))) return sendText(res, 403, "Forbidden");
  const bytes = await fs.readFile(imagePath);
  res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "no-store" });
  res.end(bytes);
}

async function serveSourceImage(res, task, file) {
  ensureSourceTaskPaths(task);
  if (!file || file.includes("..")) return sendText(res, 400, "Bad source image path");
  const sourceRoot = path.resolve(task.paths.sourceImagesDir);
  const imagePath = path.resolve(sourceRoot, file);
  if (!imagePath.startsWith(`${sourceRoot}${path.sep}`)) return sendText(res, 403, "Forbidden");
  const bytes = await fs.readFile(imagePath);
  res.writeHead(200, { "Content-Type": contentTypeForImage(imagePath), "Cache-Control": "no-store" });
  res.end(bytes);
}

async function serveTaskDownload(res, task) {
  const entries = await taskDownloadEntries(task);
  if (entries.length === 0) return sendText(res, 404, "No files to download");
  const zip = createZipBuffer(entries);
  res.writeHead(200, {
    "Content-Type": "application/zip",
    "Content-Disposition": `attachment; filename="${safeName(task.id)}.zip"`,
    "Cache-Control": "no-store",
    "Content-Length": zip.length
  });
  res.end(zip);
}

async function taskDownloadEntries(task) {
  const entries = [];
  const imagesDir = path.resolve(task.paths.imagesDir);
  assertPathInside(imagesDir, task.paths.taskDir);
  await collectDownloadFiles(imagesDir, imagesDir, entries);

  for (const store of storesFor(task.targetStores)) {
    const listing = task.listings?.[store.id];
    if (!listing) continue;
    entries.push({
      name: `${store.folder}/listing.txt`,
      data: Buffer.from([listing.title || "", "", listing.detail || ""].join("\n"), "utf8")
    });
  }

  entries.push({
    name: "task.json",
    data: Buffer.from(`${JSON.stringify(task, null, 2)}\n`, "utf8")
  });
  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

async function collectDownloadFiles(root, dir, entries) {
  const items = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const item of items) {
    const itemPath = path.join(dir, item.name);
    assertPathInside(itemPath, root);
    if (item.isDirectory()) {
      await collectDownloadFiles(root, itemPath, entries);
      continue;
    }
    if (!item.isFile()) continue;
    if (!/\.(png|jpe?g|webp|txt)$/i.test(item.name)) continue;
    const relativeName = path.relative(root, itemPath).split(path.sep).join("/");
    entries.push({ name: relativeName, data: await fs.readFile(itemPath) });
  }
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function sendText(res, status, text) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

function parseBoolean(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").toLowerCase());
}

function assertPathInside(target, root, options = {}) {
  const targetPath = path.resolve(target);
  const rootPath = path.resolve(root);
  const isRoot = targetPath === rootPath;
  if ((isRoot && !options.allowRoot) || (!isRoot && !targetPath.startsWith(`${rootPath}${path.sep}`))) {
    throw new Error("Path is outside the allowed task data directory.");
  }
}

function extensionForMime(mime) {
  if (/png/i.test(mime)) return ".png";
  if (/webp/i.test(mime)) return ".webp";
  return ".jpg";
}

function contentTypeForImage(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  return "image/png";
}

function safeName(name) {
  const base = path.basename(String(name || "image"), path.extname(String(name || "image")));
  return base
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "image";
}

async function serveStatic(req, res, pathname) {
  const filePath = path.resolve(publicRoot, pathname === "/" ? "index.html" : pathname.slice(1));
  if (!filePath.startsWith(publicRoot)) return sendText(res, 403, "Forbidden");
  const contentType = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8"
  }[path.extname(filePath)] || "application/octet-stream";
  const bytes = await fs.readFile(filePath).catch(() => null);
  if (!bytes) return sendText(res, 404, "Not found");
  res.writeHead(200, { "Content-Type": contentType, "Cache-Control": "no-store" });
  res.end(bytes);
}

export { server, validateVietnameseListing };

