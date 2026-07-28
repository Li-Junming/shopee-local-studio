import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  STORE_DEFINITIONS,
  buildBigSellerSourceConfig,
  buildBigSellerSkuConfig,
  buildImage2CliArgs,
  buildImage2Config,
  buildImageResultSummary,
  buildPreflightReport,
  describeImage2Runtime,
  expandProductCodeSkuGroup,
  listProductCodeMappings,
  makeListingDraft,
  normalizeImageReview,
  normalizeSourceImages,
  parseTaskText,
  parseSkuGroup,
  removeProductCodeMapping,
  requireBuyerProductIdentity,
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");
const workspaceRoot = path.resolve(appRoot, "..", "..");
const publicRoot = path.join(appRoot, "public");
const dataRoot = path.join(appRoot, "data", "tasks");
const uploadRoot = path.join(appRoot, "data", "uploads");
const productCodeMapPath = process.env.PRODUCT_CODE_MAP_PATH || path.join(appRoot, "data", "product-code-map.json");
const image2Cli = path.join(workspaceRoot, "tools", "image2_generator", "src", "cli.js");
const bigSellerRun = path.join(workspaceRoot, "tools", "bigseller_draft_filler", "run.ps1");
const LISTING_RULE_VERSION = 11;

await fs.mkdir(dataRoot, { recursive: true });
await fs.mkdir(uploadRoot, { recursive: true });

const server = http.createServer(async (req, res) => {
  try {
    await route(req, res);
  } catch (error) {
    sendJson(res, 500, { error: error.message });
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

  if (url.pathname === "/api/health") return sendJson(res, 200, { ok: true });
  if (url.pathname === "/api/stores") return sendJson(res, 200, { stores: STORE_DEFINITIONS });
  if (url.pathname === "/api/store-frames") return sendJson(res, 200, await storeFrameStatus());
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
    if (parts.length === 3 && req.method === "GET") return sendJson(res, 200, { task });
    if (parts.length === 3 && req.method === "DELETE") return sendJson(res, 200, { ok: true, deletedTaskId: await deleteTask(task) });
    if (parts[3] === "archive" && req.method === "POST") return sendJson(res, 200, { task: await setTaskArchived(task, true) });
    if (parts[3] === "unarchive" && req.method === "POST") return sendJson(res, 200, { task: await setTaskArchived(task, false) });
    if (parts[3] === "download" && req.method === "GET") return serveTaskDownload(res, task);
    if (parts[3] === "image-review" && req.method === "PUT") return sendJson(res, 200, { task: await updateImageReview(task, await readJson(req)) });
    if (parts[3] === "source-check" && req.method === "POST") return sendJson(res, 200, { task: await checkSourceProduct(task) });
    if (parts[3] === "confirm-source" && req.method === "POST") return sendJson(res, 200, { task: await confirmSourceProduct(task) });
    if (parts[3] === "reject-source" && req.method === "POST") return sendJson(res, 200, { task: await rejectSourceProduct(task) });
    if (parts[3] === "source-images" && req.method === "GET") return sendJson(res, 200, { images: await listSourceImages(task), review: sourceReviewState(task) });
    if (parts[3] === "source-image" && req.method === "GET") return serveSourceImage(res, task, url.searchParams.get("file"));
    if (parts[3] === "preflight" && req.method === "GET") return sendJson(res, 200, { preflight: await taskPreflight(task) });
    if (parts[3] === "listings" && req.method === "PUT") return sendJson(res, 200, { task: await updateListings(task, await readJson(req)) });
    if (parts[3] === "regenerate-listings" && req.method === "POST") return sendJson(res, 200, { task: await regenerateListings(task) });
    if (parts[3] === "image2-config" && req.method === "POST") return sendJson(res, 200, { task: await writeImage2Config(task) });
    if (parts[3] === "generate" && req.method === "POST") return sendJson(res, 202, { task: await runImage2(task) });
    if (parts[3] === "regenerate-images" && req.method === "POST") return sendJson(res, 202, { task: await runImage2(task, { overwrite: true }) });
    if (parts[3] === "bigseller-config" && req.method === "POST") return sendJson(res, 200, { task: await writeBigSellerConfig(task) });
    if (parts[3] === "discover" && req.method === "POST") return sendJson(res, 202, { task: await runBigSellerDiscover(task) });
    if (parts[3] === "save" && req.method === "POST") return sendJson(res, 202, { task: await runBigSellerSave(task) });
    if (parts[3] === "run-all" && req.method === "POST") return runFullPipelineRoute(res, task);
    if (parts[3] === "logs" && req.method === "GET") return sendText(res, 200, await readLogs(task));
    if (parts[3] === "images" && req.method === "GET") return sendJson(res, 200, { images: await listImages(task) });
    if (parts[3] === "image" && req.method === "GET") return serveTaskImage(res, task, url.searchParams.get("file"));
  }

  return serveStatic(req, res, url.pathname);
}

async function createTask(body) {
  const skuResolution = await resolveSkuInput(body.skuGroup);
  const skuGroup = skuResolution.skuGroup;
  const targetStores = storesFor(body.targetStores || []).map((store) => store.id);
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

async function writeBigSellerSourceConfig(task) {
  ensureSourceTaskPaths(task);
  const config = buildBigSellerSourceConfig({
    productName: task.productName,
    skuGroup: task.skuGroup,
    sourceImageDir: task.paths.sourceImagesDir,
    targetStores: task.targetStores
  });
  await fs.writeFile(task.paths.bigsellerSourceConfig, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  task.status = "source_config_ready";
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

  await updateStatus(task, "fetching_source_images");
  await writeBigSellerSourceConfig(task);
  try {
    await runCommandAsync(task, "bigseller_source", "powershell", [
      "-ExecutionPolicy", "Bypass",
      "-File", bigSellerRun,
      "-Config", task.paths.bigsellerSourceConfig,
      "-Source",
      "-OutDir", task.paths.sourceImagesDir
    ], path.dirname(bigSellerRun));
  } catch (error) {
    return useFallbackSource(task, `${sourceImagesMissingMessage(task)} ${error.message}`);
  }

  const manifestText = await fs.readFile(task.paths.sourceImageManifest, "utf8").catch((error) => {
    if (error.code === "ENOENT") {
      return "";
    }
    throw error;
  });
  if (!manifestText) {
    return useFallbackSource(task, sourceImagesMissingMessage(task));
  }
  const manifest = JSON.parse(manifestText);
  if (!Array.isArray(manifest.sourceImages) || manifest.sourceImages.length === 0) {
    return useFallbackSource(task, sourceImagesMissingMessage(task));
  }

  task.sourceImages = manifest.sourceImages;
  task.sourceEditUrl = manifest.editUrl;
  task.sourceTitle = manifest.sourceTitle || "";
  task.sourceDetail = manifest.sourceDetail || "";
  task.sourceRowText = manifest.sourceRowText || "";
  task.sourceMatchedSkuGroup = Array.isArray(manifest.skus) ? manifest.skus : task.skuGroup;
  task.sourceReviewRequired = true;
  task.sourceConfirmedAt = "";
  task.sourceRejectedAt = "";
  task.sourceMatchRisk = sourceSkuMatchRisk(task);
  if (task.sourceTitle && shouldUseSourceListing(task)) {
    task.productName = manifest.sourceTitle;
    task.listingSource = "source";
    task.listings = makeListingsForTask(task);
    await appendLog(task, `Updated listing text from source title: ${task.sourceTitle}`);
  }
  task.status = "source_review_required";
  task.updatedAt = new Date().toISOString();
  await saveTask(task);
  await appendLog(task, `Loaded ${task.sourceImages.length} source images from 1-store. Review is required before image generation.`);
  await appendLog(task, `[source match] ${task.sourceMatchRisk.level}: ${task.sourceMatchRisk.message} Matched SKU: ${task.sourceMatchRisk.matchedSkus.join(", ") || "none"}.`);
  return task;
}

async function useFallbackSource(task, reason) {
  task.sourceFallback = true;
  task.sourceFallbackReason = reason;
  task.sourceImages = [];
  task.sourceReviewRequired = false;
  task.sourceConfirmedAt = "";
  task.sourceRejectedAt = "";
  task.listingSource = "fallback";
  task.listings = makeListingsForTask(task, { allowFallbackIdentity: true });
  task.updatedAt = new Date().toISOString();
  await saveTask(task);
  await appendLog(task, `[source fallback] ${reason}`);
  await appendLog(task, "[source fallback] Continuing without 1搴?source images. Image jobs will use text-only generation; enter product name/notes for better accuracy.");
  return task;
}

async function checkSourceProduct(task) {
  task.sourceImages = [];
  task.sourceConfirmedAt = "";
  task.sourceRejectedAt = "";
  task.sourceReviewRequired = false;
  task.sourceFallback = false;
  task.sourceFallbackReason = "";
  await saveTask(task);
  await appendLog(task, "[source review] Starting 1-store source lookup.");
  return ensureSourceImages(task);
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
  task.paths.sourceImageManifest ??= path.join(task.paths.sourceImagesDir, "source-images.json");
}

async function writeImage2Config(task) {
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
    notes: task.notes,
    allowFallbackIdentity: Boolean(task.sourceFallback)
  });
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
  const config = buildBigSellerSkuConfig({
    productName: task.productName,
    skuGroup: task.skuGroup,
    assetRoot: task.paths.imagesDir,
    targetStores: task.targetStores
  });
  await fs.writeFile(task.paths.bigsellerSkuConfig, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  task.status = "bigseller_config_ready";
  task.updatedAt = new Date().toISOString();
  await saveTask(task);
  await appendLog(task, `Wrote BigSeller SKU config: ${task.paths.bigsellerSkuConfig}`);
  return task;
}

async function updateListings(task, body) {
  const nextListings = body.listings || {};
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
  return Object.fromEntries(task.targetStores.map((storeId) => [storeId, makeListingDraft({
    productName: task.productName,
    notes: listingNotes(task),
    storeId,
    skuGroup: task.skuGroup,
    requireIdentity: true,
    allowFallbackIdentity: Boolean(options.allowFallbackIdentity)
  })]));
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
  await writeImage2Config(task);
  task.status = options.overwrite ? "regenerating_images" : "generating_images";
  await saveTask(task);
  runCommand(task, "image2", process.execPath, buildImage2CliArgs({
    cliPath: image2Cli,
    configPath: task.paths.image2Config,
    overwrite: Boolean(options.overwrite)
  }), appRoot);
  return task;
}

async function runBigSellerDiscover(task) {
  await writeBigSellerConfig(task);
  task.status = "discovering_bigseller_drafts";
  await saveTask(task);
  runCommand(task, "bigseller_discover", "powershell", [
    "-ExecutionPolicy", "Bypass",
    "-File", bigSellerRun,
    "-Config", task.paths.bigsellerSkuConfig,
    "-Discover",
    "-Out", task.paths.bigsellerJobsConfig
  ], path.dirname(bigSellerRun));
  return task;
}

async function runBigSellerSave(task) {
  task.status = "saving_bigseller_drafts";
  await saveTask(task);
  runCommand(task, "bigseller_save", "powershell", [
    "-ExecutionPolicy", "Bypass",
    "-File", bigSellerRun,
    "-Config", task.paths.bigsellerJobsConfig,
    "-Save"
  ], path.dirname(bigSellerRun));
  return task;
}

async function runFullPipeline(task) {
  task.status = "pipeline_queued";
  task.updatedAt = new Date().toISOString();
  await saveTask(task);
  await appendLog(task, "Queued full pipeline: images -> BigSeller discover -> save draft.");
  runPipelineInBackground(task.id);
  return task;
}

async function runFullPipelineRoute(res, task) {
  const preflight = await taskPreflight(task);
  if (["blocked", "needs_confirmation"].includes(preflight.status)) {
    await appendLog(task, `[preflight] ${preflight.status}: ${preflight.blockers.map((item) => item.message).join(" ")}`);
    task.status = "preflight_blocked";
    task.updatedAt = new Date().toISOString();
    await saveTask(task);
    return sendJson(res, 409, { task, preflight, error: preflight.blockers.map((item) => item.message).join(" ") });
  }
  return sendJson(res, 202, { task: await runFullPipeline(task), preflight });
}

async function runPipelineInBackground(taskId) {
  let task = await readTask(taskId).catch(() => null);
  if (!task) return;
  try {
    await updateStatus(task, "pipeline_generating_images");
    task = await ensureSourceImages(task);
    if (!sourceReviewState(task).ready) {
      await appendLog(task, "[source review] Full pipeline paused. Confirm the 1-store source product, then run the full pipeline again.");
      return;
    }
    await assertImage2RuntimeReady(task);
    await writeImage2Config(task);
    await runCommandAsync(task, "image2", process.execPath, buildImage2CliArgs({
      cliPath: image2Cli,
      configPath: task.paths.image2Config
    }), appRoot);

    task = await readTask(taskId);
    await updateStatus(task, "pipeline_discovering_bigseller_drafts");
    await writeBigSellerConfig(task);
    await runCommandAsync(task, "bigseller_discover", "powershell", [
      "-ExecutionPolicy", "Bypass",
      "-File", bigSellerRun,
      "-Config", task.paths.bigsellerSkuConfig,
      "-Discover",
      "-Out", task.paths.bigsellerJobsConfig
    ], path.dirname(bigSellerRun));

    task = await readTask(taskId);
    await updateStatus(task, "pipeline_saving_bigseller_drafts");
    await runCommandAsync(task, "bigseller_save", "powershell", [
      "-ExecutionPolicy", "Bypass",
      "-File", bigSellerRun,
      "-Config", task.paths.bigsellerJobsConfig,
      "-Save"
    ], path.dirname(bigSellerRun));

    task = await readTask(taskId);
    await updateStatus(task, "pipeline_done");
    await appendLog(task, "Full pipeline finished.");
  } catch (error) {
    task = await readTask(taskId).catch(() => task);
    if (task) {
      await updateStatus(task, "pipeline_failed");
      await appendLog(task, `[pipeline] ${error.message}`);
    }
  }
}

async function assertImage2RuntimeReady(task) {
  const runtime = describeImage2Runtime(process.env);
  if (!runtime.apiKeySet) {
    await markImage2PreflightFailed(task, "Missing OPENAI_API_KEY. Set it before starting Shopee Local Studio.");
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

function runCommand(task, label, command, args, cwd) {
  appendLog(task, `[${label}] ${command} ${args.join(" ")}`);
  const child = spawn(command, args, {
    cwd,
    env: process.env,
    windowsHide: true
  });
  child.stdout.on("data", (chunk) => appendLog(task, chunk.toString()));
  child.stderr.on("data", (chunk) => appendLog(task, chunk.toString()));
  child.on("exit", async (code) => {
    const fresh = await readTask(task.id).catch(() => task);
    fresh.status = code === 0 ? `${label}_done` : `${label}_failed`;
    fresh.updatedAt = new Date().toISOString();
    await saveTask(fresh);
    await appendLog(fresh, `[${label}] exit ${code}`);
  });
}

function runCommandAsync(task, label, command, args, cwd) {
  appendLog(task, `[${label}] ${command} ${args.join(" ")}`);
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      windowsHide: true
    });
    child.stdout.on("data", (chunk) => appendLog(task, chunk.toString()));
    child.stderr.on("data", (chunk) => appendLog(task, chunk.toString()));
    child.on("error", reject);
    child.on("exit", async (code) => {
      await appendLog(task, `[${label}] exit ${code}`);
      if (code === 0) resolve();
      else reject(new Error(`${label} failed with exit ${code}`));
    });
  });
}

async function updateStatus(task, status) {
  task.status = status;
  task.updatedAt = new Date().toISOString();
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

async function image2RuntimeStatus() {
  const runtime = describeImage2Runtime(process.env);
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
  const tasks = await listTasks({ ...options, includeArchived: true });
  const results = [];
  for (const task of tasks) {
    if (!shouldShowTask(task, options)) continue;
    const images = await listImages(task);
    if (!images.length) continue;
    results.push(buildImageResultSummary(task, images));
  }
  return results.sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)));
}

async function readTask(id) {
  const task = JSON.parse(await fs.readFile(path.join(dataRoot, id, "task.json"), "utf8"));
  return ensureListingRulesCurrent(task);
}

async function ensureListingRulesCurrent(task) {
  if (task.listingRuleVersion === LISTING_RULE_VERSION) return task;
  if (task.status === "listings_updated") {
    task.listingRuleVersion = LISTING_RULE_VERSION;
    await saveTask(task);
    return task;
  }
  if (!Array.isArray(task.targetStores) || task.targetStores.length === 0) return task;
  task.listings = makeListingsForTask(task, { allowFallbackIdentity: shouldAllowFallbackIdentity(task) });
  task.listingRuleVersion = LISTING_RULE_VERSION;
  task.updatedAt = new Date().toISOString();
  await saveTask(task);
  return task;
}

async function saveTask(task) {
  await fs.mkdir(task.paths.taskDir, { recursive: true });
  await fs.writeFile(path.join(task.paths.taskDir, "task.json"), `${JSON.stringify(task, null, 2)}\n`, "utf8");
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
  res.writeHead(200, { "Content-Type": contentType });
  res.end(bytes);
}

export { server, validateVietnameseListing };

